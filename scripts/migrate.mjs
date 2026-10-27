// Minimal SQL migration runner. Applies supabase/migrations/*.sql in order,
// tracking applied files in a _migrations table. Idempotent.
// Run with:  node --env-file=.env scripts/migrate.mjs
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set (did you copy .env.example to .env?)");
  process.exit(1);
}

const sql = postgres(url, { onnotice: () => {} });

try {
  await sql`create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const applied = new Set(
    (await sql`select name from _migrations`).map((r) => r.name)
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· skip  ${file} (already applied)`);
      continue;
    }
    const contents = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`▶ apply ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`insert into _migrations (name) values (${file})`;
    });
    ran++;
  }
  console.log(ran === 0 ? "✓ up to date" : `✓ applied ${ran} migration(s)`);
} catch (err) {
  console.error("migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
