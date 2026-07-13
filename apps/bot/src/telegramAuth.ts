import crypto from "node:crypto";
import { config } from "./config.js";

export function verifyTelegramInitData(initData: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return false;
  }

  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return false;
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(config.BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHash, "hex"),
    Buffer.from(hash, "hex")
  );
}
