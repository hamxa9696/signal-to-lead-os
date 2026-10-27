// CLI job runner:  pnpm job <name> [--force]
// Every run is recorded in job_runs. Exits non-zero if any job errors.
import { sql } from "@/lib/db";
import { jobGroups, runJob } from "./registry";

const groups = jobGroups({ force: process.argv.includes("--force") });
const name = process.argv[2];
const jobs = name ? groups[name] : undefined;
if (!jobs) {
  console.error(`usage: pnpm job <${Object.keys(groups).join(" | ")}> [--force]`);
  process.exit(2);
}

let ok = true;
for (const job of jobs) {
  // Keep going after a failure so one broken step doesn't block the rest.
  const out = await runJob(job);
  if (out.ok && out.result) {
    const r = out.result;
    console.log(`${r.status === "ok" ? "✓" : "·"} ${job.name} ${r.status}${r.note ? ` — ${r.note}` : ""}`);
    console.log(JSON.stringify(r.stats, null, 2));
  } else {
    ok = false;
    console.error(`✗ ${job.name} failed: ${out.error}`);
  }
}
await sql.end();
process.exit(ok ? 0 : 1);
