import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as inputStream, stdout as outputStream } from "node:process";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { authConfig } from "./config.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const envPath = resolve(projectRoot, ".env");
const prompt = createInterface({ input: inputStream, output: outputStream });
const session = new StringSession("");
const client = new TelegramClient(
  session,
  authConfig.TELEGRAM_API_ID,
  authConfig.TELEGRAM_API_HASH,
  { connectionRetries: 5 }
);

try {
  console.log("QR auth mode enabled.");
  console.log("Open Telegram on your phone: Settings -> Devices -> Link Desktop Device.");

  await client.start({
    phoneNumber: async () => {
      throw Object.assign(new Error("Restart auth with QR"), {
        errorMessage: "RESTART_AUTH_WITH_QR"
      });
    },
    phoneCode: async () => {
      throw new Error("Phone code auth is disabled. Use the QR code.");
    },
    password: async (hint) =>
      readRequiredInput(
        hint ? `Telegram 2FA password (${hint}): ` : "Telegram 2FA password: "
      ),
    qrCode: async ({ token, expires }) => {
      const loginUrl = `tg://login?token=${base64Url(token)}`;
      const expiresAt = new Date(expires * 1000).toLocaleTimeString("ru-RU");

      console.log(`\nScan this QR before ${expiresAt}:`);
      qrcode.generate(loginUrl, { small: true });
      console.log(loginUrl);
    },
    onError: async (error) => {
      console.error("Telegram auth error:", error.message);
      return true;
    }
  });

  const sessionString = client.session.save() as unknown as string;
  await saveSessionToEnv(sessionString);

  console.log("\nStringSession generated and saved to .env:");
  console.log(`TELEGRAM_SESSION=${sessionString}`);
} finally {
  prompt.close();
  await client.disconnect();
}

async function readRequiredInput(question: string): Promise<string> {
  const answer = (await prompt.question(question)).trim();

  if (!answer) {
    throw new Error("Empty input");
  }

  return answer;
}

async function saveSessionToEnv(sessionString: string): Promise<void> {
  let env = "";

  try {
    env = await readFile(envPath, "utf8");
  } catch {
    env = "";
  }

  const nextLine = `TELEGRAM_SESSION=${sessionString}`;

  if (/^TELEGRAM_SESSION=.*$/m.test(env)) {
    env = env.replace(/^TELEGRAM_SESSION=.*$/m, nextLine);
  } else {
    env = `${env.trimEnd()}\n${nextLine}\n`;
  }

  await writeFile(envPath, env);
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

