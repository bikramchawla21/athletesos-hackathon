import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

export type Db = ReturnType<typeof createDb>;

let cachedPool: Pool | null = null;
let cachedDb: Db | null = null;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return url;
}

export function createDb(connectionString = getDatabaseUrl()) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export function getDb(): Db {
  if (!cachedDb) {
    cachedPool = new Pool({ connectionString: getDatabaseUrl() });
    cachedDb = drizzle(cachedPool, { schema });
  }
  return cachedDb;
}

/** True when a database URL is present (does not open a connection). */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
