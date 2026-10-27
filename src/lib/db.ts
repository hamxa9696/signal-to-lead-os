// Postgres client (server-only). Singleton across HMR reloads in dev.
import "server-only";
import postgres from "postgres";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __stlSql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis.__stlSql ??
  postgres(env.databaseUrl, {
    // Supabase's transaction pooler (used on Vercel) doesn't support prepared statements.
    prepare: false,
    max: process.env.VERCEL ? 3 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") globalThis.__stlSql = sql;
