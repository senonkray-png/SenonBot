import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const databaseUrl = process.env.DATABASE_URL;
const ssl = process.env.DATABASE_SSL === "true";

if (!databaseUrl) {
  console.error("Error: DATABASE_URL is not set in .env");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: ssl ? { rejectUnauthorized: false } : undefined
});

async function main() {
  const schemaPath = resolve(process.cwd(), "database/schema.sql");
  console.log(`Reading SQL schema from ${schemaPath}...`);
  const sql = fs.readFileSync(schemaPath, "utf8");

  console.log("Connecting to the database...");
  const client = await pool.connect();

  try {
    console.log("Applying schema migrations...");
    await client.query(sql);
    console.log("--------------------------------------------------");
    console.log("SUCCESS: Все таблицы и представления базы данных обновлены!");
    console.log("--------------------------------------------------");
  } catch (error) {
    console.error("Error applying migration SQL:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
