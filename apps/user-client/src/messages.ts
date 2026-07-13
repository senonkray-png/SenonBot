import { Api, TelegramClient } from "telegram";
import type { NewMessageEvent } from "telegram/events/index.js";
import { getListenerConfig } from "./config.js";
import { getPeerProfile, getPeerStorageId } from "./peer.js";
import { applyRetentionBeforeInsert } from "./retention.js";
import { uploadMessageMedia, type StoredMedia } from "./storage.js";
import { db } from "./db.js";
import type { FolderManager } from "./folders.js";
import {
  cancelAutoreply,
  isAiEnabled,
  pendingAiMessageIds,
  saveOwnerSample,
  scheduleAutoreply
} from "./ai-worker.js";

const listenerConfig = getListenerConfig();

/** Map of peer_id -> pending "return to general" timeout. */
const pendingReturns = new Map<number, NodeJS.Timeout>();

let foldersRef: FolderManager | null = null;

export function setFolders(folders: FolderManager): void {
  foldersRef = folders;
}

export async function handleNewMessage(
  client: TelegramClient,
  event: NewMessageEvent
): Promise<void> {
  const message = event.message;
  const peerId = getPeerStorageId(message.peerId);

  if (peerId === listenerConfig.DUMP_CHANNEL_ID) {
    return;
  }

  const isOutgoing = Boolean(message.out);

  // ---- Outgoing messages (owner or AI) ----
  if (isOutgoing) {
    await handleOutgoing(message, peerId);
    return;
  }

  // ---- Incoming messages ----
  await handleIncoming(client, message, peerId);
}

async function handleOutgoing(message: Api.Message, peerId: number): Promise<void> {
  const text = message.message?.trim() ? message.message : null;
  const messageId = Number(message.id);
  const isAi = pendingAiMessageIds.has(messageId);

  // Save to DB
  await applyRetentionBeforeInsert(peerId);
  await db.query(
    `insert into public."Messages"
      (user_id, chat_id, sender, text, is_ai_reply, timestamp)
    values ($1, $2, 'bot', $3, $4, $5)`,
    [peerId, peerId, text, isAi, new Date(message.date * 1000).toISOString()]
  );

  // If this is a real owner reply (not AI), save as style sample and cancel pending autoreply
  if (!isAi && text) {
    await saveOwnerSample(db, peerId, text);
    await cancelAutoreply(db, peerId);
    scheduleReturn(peerId);
  }
}

async function handleIncoming(
  client: TelegramClient,
  message: Api.Message,
  peerId: number
): Promise<void> {
  await upsertPeerProfile(client, message.peerId, peerId);

  const text = message.message?.trim() ? message.message : null;
  const originalMediaType = getMediaType(message);
  let mediaType = originalMediaType;
  let mediaFileId: string | null = null;
  let storedMedia: StoredMedia | null = null;

  if (originalMediaType) {
    try {
      storedMedia = await uploadMessageMedia(client, message, peerId, originalMediaType);
      mediaFileId = await forwardMediaToDump(client, message);
    } catch (error) {
      if (!storedMedia) {
        mediaType = "protected_or_failed";
      }
      console.warn("Failed to store media:", formatError(error));
    }
  }

  await applyRetentionBeforeInsert(peerId);

  await db.query(
    `insert into public."Messages"
      (user_id, chat_id, sender, text, media_file_id, media_type,
        media_storage_path, media_mime_type, media_size, is_ai_reply, timestamp)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)`,
    [
      peerId,
      peerId,
      "user",
      text,
      mediaFileId,
      mediaType,
      storedMedia?.path ?? null,
      storedMedia?.mimeType ?? null,
      storedMedia?.size ?? null,
      new Date(message.date * 1000).toISOString()
    ]
  );

  // Move to "Без Ответа" folder (only for personal chats, not groups/channels)
  if (foldersRef && peerId > 0) {
    try {
      await foldersRef.moveToUnanswered(peerId);
    } catch (error) {
      console.warn("Failed to move to unanswered folder:", formatError(error));
    }
  }

  // Schedule AI autoreply if enabled for this chat
  if (await isAiEnabled(db, peerId)) {
    try {
      const { rows } = await db.query<{ ai_delay_minutes: number }>(
        `select ai_delay_minutes from public."Settings" where id = 1`
      );
      const delay = rows[0]?.ai_delay_minutes ?? 5;
      await scheduleAutoreply(db, peerId, Number(message.id), delay);
    } catch (error) {
      console.warn("Failed to schedule autoreply:", formatError(error));
    }
  }
}

/** Called when owner reads a chat or sends a message — schedule return to general. */
export function scheduleReturn(peerId: number): void {
  const existing = pendingReturns.get(peerId);
  if (existing) clearTimeout(existing);

  // Cancel pending AI autoreply
  void cancelAutoreply(db, peerId).catch(() => {});

  // Load read_delay_minutes and schedule folder cleanup
  void db
    .query<{ read_delay_minutes: number }>(
      `select read_delay_minutes from public."Settings" where id = 1`
    )
    .then(({ rows }) => {
      const delay = (rows[0]?.read_delay_minutes ?? 2) * 60_000;
      const timeout = setTimeout(() => {
        pendingReturns.delete(peerId);
        if (foldersRef) {
          void foldersRef.returnToGeneral(peerId).catch((error) => {
            console.warn("Failed to return to general:", formatError(error));
          });
        }
      }, delay);
      pendingReturns.set(peerId, timeout);
    })
    .catch(() => {});
}

async function upsertPeerProfile(
  client: TelegramClient,
  peer: Api.TypePeer,
  peerId: number
): Promise<void> {
  const entity = (await client.getEntity(peer)) as Api.TypeUser | Api.TypeChat;
  const profile = getPeerProfile(entity, peerId);

  await db.query(
    `insert into public."Users"
      (telegram_id, username, phone, first_name, last_name, display_name, last_seen_at)
    values ($1, $2, $3, $4, $5, $6, now())
    on conflict (telegram_id) do update set
      username = excluded.username,
      phone = excluded.phone,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      display_name = excluded.display_name,
      last_seen_at = now()`,
    [
      profile.telegramId,
      profile.username,
      profile.phone,
      profile.firstName,
      profile.lastName,
      profile.displayName
    ]
  );
}

async function forwardMediaToDump(
  client: TelegramClient,
  message: Api.Message
): Promise<string> {
  const forwarded = await client.forwardMessages(listenerConfig.DUMP_CHANNEL_ID, {
    messages: message.id,
    fromPeer: message.peerId,
    silent: true,
    dropAuthor: true
  });

  const dumpedMessage = forwarded[0];

  if (!dumpedMessage) {
    throw new Error("Dump forward returned no message");
  }

  return `dump:${listenerConfig.DUMP_CHANNEL_ID}:${dumpedMessage.id}`;
}

function getMediaType(message: Api.Message): string | null {
  if (message.photo) return "photo";
  if (message.video) return "video";
  if (message.gif) return "animation";
  if (message.voice) return "voice";
  if (message.videoNote) return "video_note";
  if (message.sticker) return "sticker";
  if (message.audio) return "audio";
  if (message.document) return "document";
  if (message.contact) return "contact";
  if (message.geo) return "geo";
  if (message.poll) return "poll";
  if (message.media) return "media";
  return null;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
