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
        `Ты отвечаешь в личном Telegram-диалоге от имени реального человека. ` +
        `Пиши ТОЧНО в стиле примеров: та же длина, те же формулировки, та же пунктуация (или отсутствие). ` +
        `Никогда не обещай ничего. Не выдумывай факты. Не добавляй эмодзи, если в примерах их нет. ` +
        `Если нечего ответить по сути — просто коротко подтверди, что видел сообщение. ` +
        `Отвечай ТОЛЬКО текстом сообщения, без кавычек и пояснений.` +
        samplesBlock
    },
    {
      role: "user",
      content:
        `Контекст последних сообщений:\n${contextBlock}\n\n` +
        `Ответь на последнее сообщение от ${peerName} в моём стиле.`
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
        temperature: 0.4,
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
