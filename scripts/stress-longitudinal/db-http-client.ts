/**
 * HTTP Neon client for stress harness only.
 * Implements a fake transaction wrapper (sequential) because neon-http has no TX support,
 * while product services call db.transaction().
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../db/schema.ts";

export type Db = ReturnType<typeof createDb>;

let cachedDb: Db | null = null;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
}

export function createDb(connectionString = getDatabaseUrl()) {
  const sql = neon(connectionString);
  const db = drizzle(sql, { schema });
  // Product services use transactions; neon-http cannot. Run sequentially for stress only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).transaction = async (fn: (tx: typeof db) => Promise<unknown>) => fn(db);
  return db;
}

export function getDb(): Db {
  if (!cachedDb) cachedDb = createDb();
  return cachedDb;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
