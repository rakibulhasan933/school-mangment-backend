import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  // Supabase's transaction pooler requires TLS during the authentication
  // handshake. Keep local/non-Supabase URLs usable without forcing SSL there.
  const client = postgres(url, {
    prepare: false,
    ssl: url.includes('supabase.com') ? 'require' : undefined,
  });
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDb>;
