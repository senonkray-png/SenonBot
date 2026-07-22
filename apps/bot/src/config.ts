import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const envResult = dotenv.config({ path: resolve(projectRoot, ".env") });

if (envResult.error) {
  dotenv.config({ path: resolve(projectRoot, ".env.example") });
}

const rawEnv = {
  ...process.env,
  API_PORT: process.env.PORT ?? process.env.API_PORT
};

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  DUMP_CHANNEL_ID: z.coerce.number().int("DUMP_CHANNEL_ID must be an integer"),
  BOT_POLLING_ENABLED: z.coerce.boolean().default(true),
  API_PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z.coerce.boolean().default(false),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().url("S3_ENDPOINT must be a valid URL").optional(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("google/gemini-2.5-pro"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  FORWARD_SOURCE_CHAT_ID: z.coerce.number().optional().default(-1002449275408),
  FORWARD_SOURCE_TOPIC_ID: z.coerce.number().optional().default(1423),
  FORWARD_TARGET_CHAT_ID: z.coerce.number().optional().default(-5175839553)
});

export const config = envSchema.parse(rawEnv);
