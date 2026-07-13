import { TelegramClient } from "telegram";
import type { Pool } from "pg";
import type { ListenerConfig } from "./config.js";
import type { FolderManager } from "./folders.js";
import { generateStyledReply } from "./llm.js";

/** IDs of messages sent by the AI, so outgoing handler can tag them correctly. */
export const pendingAiMessageIds = new Set<number>();

type SettingsRow = {
  ai_delay_minutes: number;
  autoreply_mode: string;
  autoreply_template: string;
  read_delay_minutes: number;
};

type DueReply = {
  telegram_id: number;
  message_id: number;
};

type ContextMessage = {
  sender: string;
  text: string;
};

/**
 * Schedule an AI autoreply for a chat.
 * If there is already a pending reply, bump the due_at forward.
 */
export async function scheduleAutoreply(
  pool: Pool,
  telegramId: number,
  messageId: number,
  delayMinutes: number
): Promise<void> {
  await pool.query(
    `insert into public."AI_Autoreply_State" (telegram_id, message_id, due_at)
     values ($1, $2, now() + interval '1 minute' * $3)
     on conflict (telegram_id) do update set
       message_id = excluded.message_id,
       due_at = now() + interval '1 minute' * $3,
       sent_at = null,
       cancelled = false`,
    [telegramId, messageId, delayMinutes]
  );
}

/** Cancel pending autoreply when owner reads or replies manually. */
export async function cancelAutoreply(pool: Pool, telegramId: number): Promise<void> {
  await pool.query(
    `update public."AI_Autoreply_State"
     set cancelled = true
     where telegram_id = $1 and sent_at is null and cancelled = false`,
    [telegramId]
  );
}

/** Check whether AI is enabled for a specific chat. */
export async function isAiEnabled(pool: Pool, telegramId: number): Promise<boolean> {
  const { rows } = await pool.query<{ enabled: boolean }>(
    `select enabled from public."AI_Chats" where telegram_id = $1`,
    [telegramId]
  );
  return rows[0]?.enabled ?? false;
}

/** Get current autoresponder settings. */
async function getSettings(pool: Pool): Promise<SettingsRow> {
  const { rows } = await pool.query<SettingsRow>(
    `select ai_delay_minutes, autoreply_mode, autoreply_template, read_delay_minutes
     from public."Settings" where id = 1`
  );
  if (!rows[0]) throw new Error("Settings row missing");
  return rows[0];
}

/** Get due autoreplies. */
async function getDueReplies(pool: Pool): Promise<DueReply[]> {
  const { rows } = await pool.query<DueReply>(
    `select telegram_id, message_id from public."AI_Autoreply_State"
     where due_at <= now() and sent_at is null and cancelled = false`
  );
  return rows;
}

/** Mark autoreply as sent. */
async function markSent(pool: Pool, telegramId: number): Promise<void> {
  await pool.query(
    `update public."AI_Autoreply_State" set sent_at = now() where telegram_id = $1`,
    [telegramId]
  );
}

/** Get last N messages from a chat for LLM context. */
async function getChatContext(pool: Pool, chatId: number, limit = 20): Promise<ContextMessage[]> {
  const { rows } = await pool.query<{ sender: string; text: string }>(
    `select sender, coalesce(text, '') as text from public."Messages"
     where chat_id = $1 and text is not null and text != ''
     order by timestamp desc, id desc limit $2`,
    [chatId, limit]
  );
  return rows.reverse();
}

/** Get owner's real messages as style samples. */
async function getOwnerSamples(pool: Pool, chatId: number, limit = 30): Promise<string[]> {
  // First try chat-specific samples from AI_Owner_Samples
  const { rows: samples } = await pool.query<{ text: string }>(
    `select text from public."AI_Owner_Samples"
     where chat_id = $1
     order by created_at desc limit $2`,
    [chatId, limit]
  );
  if (samples.length >= 5) return samples.map((r) => r.text);

  // Fallback: real owner messages from Messages table (sender='bot', not AI)
  const { rows: msgs } = await pool.query<{ text: string }>(
    `select text from public."Messages"
     where sender = 'bot' and is_ai_reply = false
       and text is not null and text != ''
     order by timestamp desc limit $1`,
    [limit]
  );
  return msgs.map((r) => r.text);
}

/** Save owner's real message as a writing style sample. */
export async function saveOwnerSample(pool: Pool, chatId: number, text: string): Promise<void> {
  if (!text || text.trim().length < 2) return;
  await pool.query(
    `insert into public."AI_Owner_Samples" (chat_id, text) values ($1, $2)`,
    [chatId, text.trim()]
  );
}

/**
 * Main autoreply worker loop. Runs every 10 seconds.
 */
export function startAiWorker(
  client: TelegramClient,
  pool: Pool,
  config: ListenerConfig,
  folders: FolderManager
): NodeJS.Timeout {
  const interval = setInterval(() => {
    void processAutoReplies(client, pool, config, folders).catch((error) => {
      console.error("AI worker error:", error);
    });
  }, 10_000);

  console.log("AI autoreply worker started (10s interval)");
  return interval;
}

async function processAutoReplies(
  client: TelegramClient,
  pool: Pool,
  listenerConfig: ListenerConfig,
  folders: FolderManager
): Promise<void> {
  const settings = await getSettings(pool);
  const dueReplies = await getDueReplies(pool);

  for (const reply of dueReplies) {
    try {
      // Verify AI is still enabled for this chat
      if (!(await isAiEnabled(pool, reply.telegram_id))) {
        await markSent(pool, reply.telegram_id);
        continue;
      }

      const context = await getChatContext(pool, reply.telegram_id);
      const samples = await getOwnerSamples(pool, reply.telegram_id);

      // Get peer name
      let peerName = String(reply.telegram_id);
      try {
        const entity = await client.getEntity(reply.telegram_id);
        if ("firstName" in entity) {
          peerName = (entity.firstName as string) || peerName;
        }
      } catch { /* use ID as name */ }

      // Generate AI reply or fall back to template
      let replyText = settings.autoreply_template;
      const generated = await generateStyledReply(listenerConfig, context, samples, peerName);
      if (generated) {
        replyText = generated;
      }

      // Send the message
      const sent = await client.sendMessage(reply.telegram_id, { message: replyText });
      const sentId = "id" in sent ? Number(sent.id) : 0;
      if (sentId) {
        pendingAiMessageIds.add(sentId);
        // Auto-cleanup after 30 seconds
        setTimeout(() => pendingAiMessageIds.delete(sentId), 30_000);
      }

      await markSent(pool, reply.telegram_id);

      console.log(`AI reply sent to ${reply.telegram_id}`);
    } catch (error) {
      console.error(`AI reply failed for ${reply.telegram_id}:`, error);
    }
  }
}
