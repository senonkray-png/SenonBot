import type { ListenerConfig } from "./config.js";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

type LlmResponse = {
  choices: Array<{ message: { content: string } }>;
};

/**
 * Generate an AI reply that imitates the owner's writing style.
 *
 * @param config   - listener config with LLM keys/model
 * @param context  - last N messages for dialogue context
 * @param samples  - real owner messages used as style examples
 * @param peerName - name of the person we are replying to
 */
export async function generateStyledReply(
  config: ListenerConfig,
  context: Array<{ sender: string; text: string }>,
  samples: string[],
  peerName: string
): Promise<string | null> {
  const apiKey = config.OPENROUTER_API_KEY || config.OPENAI_API_KEY;
  if (!apiKey) return null;

  const isOpenRouter = Boolean(config.OPENROUTER_API_KEY);
  const baseUrl = isOpenRouter
    ? "https://openrouter.ai/api/v1"
    : "https://api.openai.com/v1";
  const model = isOpenRouter ? config.OPENROUTER_MODEL : config.OPENAI_MODEL;

  const samplesBlock = samples.length > 0
    ? `\n\nПримеры моих реальных сообщений (имитируй этот стиль, длину, пунктуацию):\n${samples.map((s, i) => `${i + 1}. "${s}"`).join("\n")}`
    : "";

  const contextBlock = context
    .map((m) => `${m.sender === "bot" ? "Я" : peerName}: ${m.text}`)
    .join("\n");

  const messages: Message[] = [
    {
      role: "system",
      content:
        `Ты — живой человек, общающийся в личном чате Telegram. Твоя задача — ответить на последнее сообщение собеседника, полностью переняв стиль, вайб, отношение, настроение и манеру общения владельца аккаунта.\n\n` +
        `ПРАВИЛА ИМИТАЦИИ СТИЛЯ:\n` +
        `1. Внимательно проанализируй примеры сообщений владельца ниже. Обрати внимание на:\n` +
        `   - Длину предложений (пиши кратко, если примеры короткие).\n` +
        `   - Пунктуацию и регистр: использует ли он точки в конце? Запятые? Пишет ли с большой буквы? Имитируй это (например, если он пишет без знаков препинания и строчными буквами, отвечай так же).\n` +
        `   - Сленг, сокращения (норм, ща, ок, спс, пж) и специфические привычки.\n` +
        `   - Настроение, вайб и эмоциональный тон: будь дружелюбным, расслабленным, занятым или кратким — в точности как владелец.\n` +
        `2. Отвечай как живой человек в мессенджере. Избегай неестественных шаблонных фраз вроде "Я могу вам помочь?" или "К сожалению, я сейчас занят". Пиши простыми разговорными словами.\n` +
        `3. КРИТИЧЕСКОЕ ПРАВИЛО: Ничего не обещай и не бери обязательств. Не говори "я сделаю это позже", "я приеду завтра" или "перезвоню через час". Если от тебя требуют действий или обещаний, отвечай уклончиво и выигрывай время в стиле владельца (например: "гляну", "ща занят", "позже наберу", "ок", "посмотрим").\n` +
        `4. Отвечай на последнее сообщение собеседника, опираясь на контекст предыдущей бесебы.\n` +
        `5. СТРОГОЕ ЗАПРЕЩЕНИЕ КОПИРОВАНИЯ: Никогда не копируй присланные примеры моих сообщений дословно. Не используй их как шаблоны для копипасты. Придумывай свой уникальный текст ответа, подходящий под текущий диалог, но оформляй его точно в стиле этих примеров.\n` +
        `6. Выдавай ТОЛЬКО текст сообщения, без кавычек, вводных слов ("Ответ:") или пояснений.` +
        samplesBlock
    },
    {
      role: "user",
      content:
        `Контекст диалога:\n${contextBlock}\n\n` +
        `Напиши естественный ответ от моего имени на последнее сообщение от ${peerName}, идеально имитируя мой вайб и стиль.`
    }
  ];

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.85,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      console.error("LLM API error:", response.status, await response.text());
      return null;
    }

    const data = (await response.json()) as LlmResponse;
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error("LLM request failed:", error);
    return null;
  }
}
