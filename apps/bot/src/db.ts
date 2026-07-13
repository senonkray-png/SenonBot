import { Pool, types } from "pg";
import { config } from "./config.js";

types.setTypeParser(types.builtins.INT8, (value) => Number(value));

export const db = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined
});

// ---- Settings -----------------------------------------------------------

export type FullSettings = {
  messageLimit: number;
  aiDelayMinutes: number;
  autoreplyMode: string;
  autoreplyTemplate: string;
  readDelayMinutes: number;
};

type SettingsRow = {
  message_limit: number;
  ai_delay_minutes: number;
  autoreply_mode: string;
  autoreply_template: string;
  read_delay_minutes: number;
};

function rowToSettings(row: SettingsRow): FullSettings {
  return {
    messageLimit: row.message_limit,
    aiDelayMinutes: row.ai_delay_minutes,
    autoreplyMode: row.autoreply_mode,
    autoreplyTemplate: row.autoreply_template,
    readDelayMinutes: row.read_delay_minutes
  };
}

export async function getFullSettings(): Promise<FullSettings> {
  const { rows } = await db.query<SettingsRow>(
    `select message_limit, ai_delay_minutes, autoreply_mode,
            autoreply_template, read_delay_minutes
     from public."Settings" where id = 1`
  );

  if (!rows[0]) {
    throw new Error("Settings row is missing");
  }

  return rowToSettings(rows[0]);
}

export async function updateFullSettings(
  patch: Partial<FullSettings>
): Promise<FullSettings> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.messageLimit !== undefined) {
    sets.push(`message_limit = $${i++}`);
    values.push(patch.messageLimit);
  }

  if (patch.aiDelayMinutes !== undefined) {
    sets.push(`ai_delay_minutes = $${i++}`);
    values.push(patch.aiDelayMinutes);
  }

  if (patch.autoreplyMode !== undefined) {
    sets.push(`autoreply_mode = $${i++}`);
    values.push(patch.autoreplyMode);
  }

  if (patch.autoreplyTemplate !== undefined) {
    sets.push(`autoreply_template = $${i++}`);
    values.push(patch.autoreplyTemplate);
  }

  if (patch.readDelayMinutes !== undefined) {
    sets.push(`read_delay_minutes = $${i++}`);
    values.push(patch.readDelayMinutes);
  }

  if (sets.length === 0) {
    return getFullSettings();
  }

  const { rows } = await db.query<SettingsRow>(
    `update public."Settings"
     set ${sets.join(", ")}
     where id = 1
     returning message_limit, ai_delay_minutes, autoreply_mode,
               autoreply_template, read_delay_minutes`,
    values
  );

  if (!rows[0]) {
    throw new Error("Settings row is missing");
  }

  return rowToSettings(rows[0]);
}

// Legacy wrappers for backward compatibility
export async function getMessageLimit(): Promise<number> {
  return (await getFullSettings()).messageLimit;
}

export async function setMessageLimit(messageLimit: number): Promise<number> {
  const result = await updateFullSettings({ messageLimit });
  return result.messageLimit;
}

// ---- AI chat toggle ------------------------------------------------------

export async function enableAiChat(telegramId: number): Promise<void> {
  await db.query(
    `insert into public."AI_Chats" (telegram_id, enabled)
     values ($1, true)
     on conflict (telegram_id) do update set enabled = true`,
    [telegramId]
  );
}

export async function disableAiChat(telegramId: number): Promise<void> {
  await db.query(
    `update public."AI_Chats" set enabled = false where telegram_id = $1`,
    [telegramId]
  );
}
