import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  const client = postgres(url, { prepare: false });
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDb>;
