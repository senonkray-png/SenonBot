import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export function loadEnv(): void {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const envResult = dotenv.config({ path: resolve(projectRoot, ".env") });

  if (envResult.error) {
    dotenv.config({ path: resolve(projectRoot, ".env.example") });
  }
}

