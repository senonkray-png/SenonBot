import { Bot } from "grammy";
import { startApiServer } from "./api.js";
import { config } from "./config.js";
import { handleIncomingMessage } from "./messages.js";
import { getMessageLimit } from "./db.js";

const bot = new Bot(config.BOT_TOKEN);

bot.command("start", async (ctx) => {
  const messageLimit = await getMessageLimit();
  await ctx.reply(`Bot is connected. Current message limit: ${messageLimit}`);
});

bot.on("message", handleIncomingMessage);

bot.catch((error) => {
  console.error("Bot error:", error);
});

startApiServer();

if (config.BOT_POLLING_ENABLED) {
  void startTelegramBot();
} else {
  console.log("Telegram bot polling is disabled. API server only mode is active.");
}

process.on("unhandledRejection", (reason) => {
  if (isGetUpdatesConflict(reason)) {
    console.warn(
      "Telegram bot polling conflict reached unhandledRejection. Keeping API alive."
    );
    return;
  }

  console.error("Unhandled rejection:", reason);
  process.exitCode = 1;
});

async function startTelegramBot(): Promise<void> {
  try {
    await bot.start({
      onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} started`);
      }
    });
  } catch (error) {
    if (isGetUpdatesConflict(error)) {
      console.warn(
        "Telegram bot polling conflict: another instance is using this BOT_TOKEN. Retrying in 30 seconds."
      );
      setTimeout(() => {
        void startTelegramBot();
      }, 30_000);
      return;
    }

    throw error;
  }
}

function isGetUpdatesConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("409") && message.includes("getUpdates")) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return message.includes("Conflict") && message.includes("getUpdates");
  }

  const maybeError = error as {
    method?: string;
    error_code?: number;
    description?: string;
  };

  return (
    (maybeError.method === "getUpdates" || message.includes("getUpdates")) &&
    (maybeError.error_code === 409 || message.includes("409")) &&
    (Boolean(maybeError.description?.includes("Conflict")) || message.includes("Conflict"))
  );
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (bot.isRunning()) {
      bot.stop();
    }
  });
}
