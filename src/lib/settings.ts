// Small key/value settings stored in the database (ids created in external services).
import "server-only";
import { sql } from "./db";

export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await sql<{ value: T }[]>`select value from app_settings where key = ${key}`;
  return row?.value ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await sql`
    insert into app_settings (key, value) values (${key}, ${sql.json(value as never)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}
