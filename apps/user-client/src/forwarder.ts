import { Api, type TelegramClient } from "telegram";
import { getListenerConfig } from "./config.js";
import { db } from "./db.js";

const listenerConfig = getListenerConfig();

export type ForwardRule = {
  source_chat_id: number;
  source_topic_id: number | null;
  target_chat_id: number;
  target_topic_id: number | null;
};

export function normalizeChatId(id: number | string): string {
  const str = String(id).trim();
  if (str.startsWith("-100")) return str.slice(4);
  if (str.startsWith("-")) return str.slice(1);
  return str;
}

export function isChatIdMatch(id1: number | string, id2: number | string): boolean {
  return normalizeChatId(id1) === normalizeChatId(id2);
}

export function getTargetIdsToTry(targetChatId: number | string): (number | string)[] {
  const norm = normalizeChatId(targetChatId);
  return [
    targetChatId,
    `-100${norm}`,
    `-${norm}`,
    Number(`-100${norm}`),
    Number(`-${norm}`)
  ].filter((v, idx, arr) => arr.indexOf(v) === idx);
}

export function getTopicId(message: Api.Message): number | undefined {
  if (!message.replyTo) return undefined;
  const anyReplyTo = message.replyTo as unknown as Record<string, unknown>;
  const topId = Number(anyReplyTo.replyToTopId);
  const msgId = Number(anyReplyTo.replyToMsgId);
  return (topId || msgId) || undefined;
}

export async function processUserClientMessageForwarding(
  client: TelegramClient,
  message: Api.Message,
  sourceChatId: number
): Promise<void> {
  const sourceTopicId = getTopicId(message);
  const messageId = Number(message.id);

  const rules = await getActiveForwardRules();

  for (const rule of rules) {
    if (!isChatIdMatch(sourceChatId, rule.source_chat_id)) {
      continue;
    }

    if (rule.source_topic_id !== null && rule.source_topic_id !== undefined) {
      if (sourceTopicId !== rule.source_topic_id && messageId !== rule.source_topic_id) {
        continue;
      }
    }

    await copyPublicationWithUserClient(client, sourceChatId, message, rule.target_chat_id);
  }
}

export async function copyPublicationWithUserClient(
  client: TelegramClient,
  sourceChatId: number,
  message: Api.Message,
  targetChatId: number | string
): Promise<boolean> {
  const messageId = Number(message.id);
  const lockAcquired = await tryAcquireCopyLock(sourceChatId, messageId, targetChatId);
  if (!lockAcquired) {
    return false;
  }

  const targetsToTry = getTargetIdsToTry(targetChatId);
  for (const tid of targetsToTry) {
    try {
      let forwarded: Api.TypeMessage[] | undefined;
      try {
        forwarded = await client.forwardMessages(tid, {
          messages: [messageId],
          fromPeer: message.peerId,
          dropAuthor: true
        });
      } catch {
        const entity = await client.getEntity(tid);
        forwarded = await client.forwardMessages(entity, {
          messages: [messageId],
          fromPeer: message.peerId,
          dropAuthor: true
        });
      }

      if (forwarded && forwarded.length > 0) {
        const first = forwarded[0];
        const copiedId = first ? Number(first.id) : undefined;
        if (copiedId) {
          await updateCopiedMessageRecord(sourceChatId, messageId, targetChatId, copiedId);
        }
        console.log(`[UserClient Forwarder] Successfully copied message ${messageId} to ${tid}`);
        return true;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[UserClient Forwarder] Copy attempt to ${tid} failed:`, msg);
    }
  }

  return false;
}

export async function tryAcquireCopyLock(
  sourceChatId: number | string,
  sourceMessageId: number,
  targetChatId: number | string
): Promise<boolean> {
  try {
    const sId = Number(`-${normalizeChatId(sourceChatId)}`);
    const tId = Number(`-${normalizeChatId(targetChatId)}`);
    const { rowCount } = await db.query(
      `insert into public."Copied_Messages" (source_chat_id, source_message_id, target_chat_id)
       values ($1, $2, $3)
       on conflict (source_chat_id, source_message_id, target_chat_id) do nothing`,
      [sId, sourceMessageId, tId]
    );
    return (rowCount ?? 0) > 0;
  } catch (error) {
    console.warn("[UserClient Forwarder] DB lock acquire failed:", error);
    return true;
  }
}

async function updateCopiedMessageRecord(
  sourceChatId: number | string,
  sourceMessageId: number,
  targetChatId: number | string,
  targetMessageId: number
): Promise<void> {
  try {
    const sId = Number(`-${normalizeChatId(sourceChatId)}`);
    const tId = Number(`-${normalizeChatId(targetChatId)}`);
    await db.query(
      `update public."Copied_Messages"
       set target_message_id = $4
       where source_chat_id = $1 and source_message_id = $2 and target_chat_id = $3`,
      [sId, sourceMessageId, tId, targetMessageId]
    );
  } catch (error) {
    console.warn("[UserClient Forwarder] Failed to update copied message record:", error);
  }
}

export async function getActiveForwardRules(): Promise<ForwardRule[]> {
  try {
    const { rows } = await db.query<ForwardRule>(
      `select source_chat_id, source_topic_id, target_chat_id, target_topic_id
       from public."Forward_Rules"
       where is_active = true`
    );
    if (rows.length > 0) {
      return rows;
    }
  } catch (error) {
    console.warn("[UserClient Forwarder] Could not load rules from DB, using config default:", error);
  }

  return [
    {
      source_chat_id: listenerConfig.FORWARD_SOURCE_CHAT_ID,
      source_topic_id: listenerConfig.FORWARD_SOURCE_TOPIC_ID,
      target_chat_id: listenerConfig.FORWARD_TARGET_CHAT_ID,
      target_topic_id: null
    }
  ];
}
