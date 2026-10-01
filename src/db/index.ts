import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const configuredDatabaseUrl = process.env.DATABASE_URL;

/**
 * Keep database construction side-effect free at module import time.
 *
 * Vercel evaluates server modules during `next build`. Throwing here when
 * DATABASE_URL is absent prevents even the public, database-independent
 * homepage from being built. pg does not open a connection until a query is
 * executed, so a local placeholder lets the application compile safely while
 * real database-backed requests still fail fast with a clear connection error.
 */
const databaseUrl =
  configuredDatabaseUrl ??
  "postgresql://aiphone_build:aiphone_build@127.0.0.1:5432/aiphone_build";

const globalForDb = globalThis as typeof globalThis & {
  __aiphonePostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__aiphonePostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: configuredDatabaseUrl ? 10_000 : 1_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__aiphonePostgresqlPool = pool;
}

export const db = drizzle(pool);

export const databaseConfigured = Boolean(configuredDatabaseUrl);
