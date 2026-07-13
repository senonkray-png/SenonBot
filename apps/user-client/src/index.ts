import { TelegramClient } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import { Raw } from "telegram/events/Raw.js";
import { Api } from "telegram/tl/index.js";
import { StringSession } from "telegram/sessions/index.js";
import { getListenerConfig } from "./config.js";
import { handleNewMessage, scheduleReturn, setFolders } from "./messages.js";
import { FolderManager } from "./folders.js";
import { startAiWorker } from "./ai-worker.js";
import { db } from "./db.js";

const listenerConfig = getListenerConfig();
const session = new StringSession(listenerConfig.TELEGRAM_SESSION);
const client = new TelegramClient(
  session,
  listenerConfig.TELEGRAM_API_ID,
  listenerConfig.TELEGRAM_API_HASH,
  { connectionRetries: 5 }
);

try {
  await client.connect();
} catch (error) {
  if (isAuthKeyDuplicated(error)) {
    console.error(
      [
        "Telegram rejected TELEGRAM_SESSION with AUTH_KEY_DUPLICATED.",
        "Stop every other user-client process that uses this session, generate a new StringSession with npm run auth, update TELEGRAM_SESSION in Railway, then redeploy only one user-client instance."
      ].join(" ")
    );
    process.exit(0);
  }

  throw error;
}

// Initialize Telegram folder manager
const folders = new FolderManager(client, listenerConfig.UNANSWERED_FOLDER);

try {
  await folders.init();
} catch (error) {
  console.warn("Failed to initialize Telegram folder manager:", error);
}

// Pass folders reference to messages module
setFolders(folders);

// Handle new messages (incoming + outgoing)
client.addEventHandler(
  (event) => {
    void handleNewMessage(client, event).catch((error) => {
      console.error("Failed to handle Telegram message:", error);
    });
  },
  new NewMessage({})
);

// Handle read events — when owner reads a message from any device
client.addEventHandler(
  (update) => {
    if (update instanceof Api.UpdateReadHistoryInbox) {
      const peer = update.peer;
      let peerId: number | null = null;

      if (peer instanceof Api.PeerUser) {
        peerId = Number(peer.userId);
      } else if (peer instanceof Api.PeerChat) {
        peerId = -Number(peer.chatId);
      } else if (peer instanceof Api.PeerChannel) {
        peerId = Number(`-100${Number(peer.channelId)}`);
      }

      if (peerId) {
        scheduleReturn(peerId);
      }
    }
  },
  new Raw({})
);

// Start AI autoreply worker
const aiWorkerInterval = startAiWorker(client, db, listenerConfig, folders);

console.log("Telegram user-client is listening for new messages (with AI autoresponder)");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(aiWorkerInterval);
    void client.disconnect().finally(() => {
      process.exit(0);
    });
  });
}

await new Promise(() => undefined);

function isAuthKeyDuplicated(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorLike = error as { errorMessage?: unknown; message?: unknown; code?: unknown };
  const message = String(errorLike.errorMessage ?? errorLike.message ?? "");

  return errorLike.code === 406 && message.includes("AUTH_KEY_DUPLICATED");
}
