import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const envPath = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    process.env[key] ??= value;
  }
}

const required = [
  "BOT_TOKEN",
  "DUMP_CHANNEL_ID",
  "CORS_ORIGIN",
  "TELEGRAM_API_ID",
  "TELEGRAM_API_HASH",
  "TELEGRAM_SESSION",
  "DATABASE_URL",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "VITE_API_BASE_URL"
];

const missing = required.filter((key) => {
  const value = process.env[key]?.trim();
  return !value || value === "replace_me" || value.includes("replace_me");
});

if (missing.length > 0) {
  console.error("Missing or placeholder environment variables:");
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

const urlKeys = ["CORS_ORIGIN", "DATABASE_URL", "S3_ENDPOINT", "VITE_API_BASE_URL"];
const invalidUrls = urlKeys.filter((key) => {
  try {
    new URL(process.env[key]);
    return false;
  } catch {
    return true;
  }
});

if (invalidUrls.length > 0) {
  console.error("Invalid URL environment variables:");
  for (const key of invalidUrls) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log("Environment looks ready for deploy.");
