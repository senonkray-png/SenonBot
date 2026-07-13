import { Pool, types } from "pg";
import { getListenerConfig } from "./config.js";

const listenerConfig = getListenerConfig();

types.setTypeParser(types.builtins.INT8, (value) => Number(value));

export const db = new Pool({
  connectionString: listenerConfig.DATABASE_URL,
  ssl: listenerConfig.DATABASE_SSL ? { rejectUnauthorized: false } : undefined
});

export async function getMessageLimit(): Promise<number> {
  const { rows } = await db.query<{ message_limit: number }>(
    'select message_limit from public."Settings" where id = 1'
  );

  const settings = rows[0];

  if (!settings) {
    throw new Error("Settings row is missing");
  }

  return settings.message_limit;
}
