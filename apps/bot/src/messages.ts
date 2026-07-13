import type { Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { config } from "./config.js";
import { db, getMessageLimit } from "./db.js";

type TelegramMessage = NonNullable<Context["message"]>;

type StoredMessageInput = {
  userId: number;
  chatId: number;
  text: string | null;
  mediaFileId: string | null;
  mediaType: string | null;
};

const MEDIA_FIELDS = [
  "photo",
  "video",
  "animation",
  "document",
  "audio",
  "voice",
  "video_note",
  "sticker"
] as const;

export async function handleIncomingMessage(ctx: Context): Promise<void> {
  const message = ctx.message;

  if (!message?.from) {
    return;
  }

  const userId = message.from.id;
  const chatId = message.chat.id;
  const originalMediaType = getMediaType(message);
  const text = extractText(message);

  await upsertUserProfile(message.from);
  await upsertContactProfile(message);

  let mediaFileId: string | null = null;
  let mediaType: string | null = originalMediaType;

  if (originalMediaType) {
    try {
      mediaFileId = await copyMediaToDump(ctx, chatId, message.message_id);
    } catch (error) {
      mediaType = "protected_or_failed";
      mediaFileId = null;
      console.warn("Failed to copy media to dump channel:", formatError(error));
    }
  }

  await saveMessageWithRetention({
    userId,
    chatId,
    text,
    mediaFileId,
    mediaType
  });
}

function extractText(message: TelegramMessage): string | null {
  const text = "text" in message ? message.text : undefined;
  const caption = "caption" in message ? message.caption : undefined;
  return text ?? caption ?? null;
}

function getMediaType(message: TelegramMessage): string | null {
  for (const mediaField of MEDIA_FIELDS) {
    if (mediaField in message && message[mediaField]) {
      return mediaField;
    }
  }

  return null;
}

async function copyMediaToDump(
  ctx: Context,
  chatId: number,
  messageId: number
): Promise<string> {
  const copiedMessage = await ctx.api.copyMessage(
    config.DUMP_CHANNEL_ID,
    chatId,
    messageId
  );

  return `dump:${config.DUMP_CHANNEL_ID}:${copiedMessage.message_id}`;
}

async function saveMessageWithRetention(input: StoredMessageInput): Promise<void> {
  const isVip = await isVipUser(input.userId);

  if (!isVip) {
    const messageLimit = await getMessageLimit();
    await deleteOldMessagesBeforeInsert(input.userId, messageLimit);
  }

  await db.query(
    `insert into public."Messages"
      (user_id, chat_id, sender, text, media_file_id, media_type)
    values ($1, $2, 'user', $3, $4, $5)`,
    [input.userId, input.chatId, input.text, input.mediaFileId, input.mediaType]
  );
}

async function upsertUserProfile(user: TelegramMessage["from"]): Promise<void> {
  if (!user) {
    return;
  }

  const firstName = user.first_name ?? null;
  const lastName = "last_name" in user ? user.last_name ?? null : null;
  const username = "username" in user ? user.username ?? null : null;
  const displayName = buildDisplayName(user);

  await db.query(
    `insert into public."Users"
      (telegram_id, username, first_name, last_name, display_name, last_seen_at)
    values ($1, $2, $3, $4, $5, now())
    on conflict (telegram_id) do update set
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      display_name = excluded.display_name,
      last_seen_at = now()`,
    [user.id, username, firstName, lastName, displayName]
  );
}

async function upsertContactProfile(message: TelegramMessage): Promise<void> {
  if (!("contact" in message) || !message.contact?.user_id) {
    return;
  }

  const contact = message.contact;
  const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");

  const phone = contact.phone_number.startsWith("+")
    ? contact.phone_number
    : `+${contact.phone_number}`;

  await db.query(
    `insert into public."Users"
      (telegram_id, phone, first_name, last_name, display_name, last_seen_at)
    values ($1, $2, $3, $4, $5, now())
    on conflict (telegram_id) do update set
      phone = excluded.phone,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      display_name = excluded.display_name,
      last_seen_at = now()`,
    [
      contact.user_id,
      phone,
      contact.first_name,
      contact.last_name ?? null,
      displayName || `User ${contact.user_id}`
    ]
  );
}

function buildDisplayName(user: TelegramMessage["from"] | UserFromGetMe): string {
  const parts = [
    "first_name" in user ? user.first_name : null,
    "last_name" in user ? user.last_name : null
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" ");
  }

  if ("username" in user && user.username) {
    return `@${user.username}`;
  }

  return `User ${user.id}`;
}

async function isVipUser(userId: number): Promise<boolean> {
  const { rowCount } = await db.query(
    'select 1 from public."VIP_Users" where telegram_id = $1 limit 1',
    [userId]
  );

  return (rowCount ?? 0) > 0;
}

async function deleteOldMessagesBeforeInsert(
  userId: number,
  messageLimit: number
): Promise<void> {
  const { rows: countRows } = await db.query<{ count: number }>(
    'select count(*)::int as count from public."Messages" where user_id = $1',
    [userId]
  );
  const currentCount = countRows[0]?.count ?? 0;
  const messagesToDelete = currentCount - messageLimit + 1;

  if (messagesToDelete <= 0) {
    return;
  }

  const { rows: oldestMessages } = await db.query<{ id: number }>(
    `select id from public."Messages"
    where user_id = $1
    order by timestamp asc, id asc
    limit $2`,
    [userId, messagesToDelete]
  );

  const idsToDelete = oldestMessages.map((message) => message.id);

  if (idsToDelete.length === 0) {
    return;
  }

  await db.query('delete from public."Messages" where id = any($1::bigint[])', [
    idsToDelete
  ]);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
