"use server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { generateFromProfiles, slugify } from "@/lib/taxonomy";
import { loadTargeting } from "@/lib/targeting";
import { runJob } from "@/jobs/registry";
import { sortSignals } from "@/jobs/sort-signals";

export type Msg = { ok: boolean; message: string } | null;
const UUID = /^[0-9a-f-]{36}$/;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const ids = (f: FormData, k: string) => f.getAll(k).map(String).filter((x) => UUID.test(x));
const list = (s: string) => s.split(/[,、\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
const done = () => {
  revalidatePath("/categories");
  revalidatePath("/signals");
};

export async function saveCategory(form: FormData): Promise<void> {
  const id = str(form, "id");
  const name_en = str(form, "name_en");
  if (!name_en) return;
  const v = {
    name_en,
    name_ja: str(form, "name_ja"),
    description: str(form, "description") || null,
    color: /^#[0-9a-f]{6}$/i.test(str(form, "color")) ? str(form, "color") : "#2F6B55",
    active: UUID.test(id) ? form.get("active") === "on" : true,
  };
  let catId = id;
  if (UUID.test(id)) await sql`update categories set ${sql(v)} where id = ${id}`;
  else {
    const [row] = await sql<{ id: string }[]>`
      insert into categories ${sql({ ...v, slug: slugify(name_en), sort: 99 })} on conflict (slug) do nothing returning id`;
    if (!row) return;
    catId = row.id;
  }
  // Services ticked here move into this category; unticked ones that were here become uncategorised.
  const svc = ids(form, "service_ids");
  if (form.has("services_shown")) {
    await sql`update services set category_id = null where category_id = ${catId} and not (id = any(${svc}::uuid[]))`;
    if (svc.length) await sql`update services set category_id = ${catId} where id = any(${svc}::uuid[])`;
  }
  done();
}

export async function deleteCategory(form: FormData): Promise<void> {
  const id = str(form, "id");
  if (UUID.test(id)) await sql`delete from categories where id = ${id}`;
  done();
}

export async function saveSubcategory(form: FormData): Promise<void> {
  const id = str(form, "id");
  const name_en = str(form, "name_en");
  const category_id = str(form, "category_id");
  if (!name_en || !UUID.test(category_id)) return;
  const v = {
    category_id,
    name_en,
    name_ja: str(form, "name_ja"),
    industry: str(form, "industry") || null,
    description: str(form, "description") || null,
    keywords: list(str(form, "keywords")),
    persona_ids: ids(form, "persona_ids"),
    active: UUID.test(id) ? form.get("active") === "on" : true,
  };
  if (UUID.test(id)) await sql`update subcategories set ${sql(v)} where id = ${id}`;
  else await sql`insert into subcategories ${sql({ ...v, slug: `${slugify(name_en)}-${Date.now().toString(36).slice(-4)}`, origin: "manual" })}`;
  done();
}

export async function deleteSubcategory(form: FormData): Promise<void> {
  const id = str(form, "id");
  if (UUID.test(id)) await sql`delete from subcategories where id = ${id}`;
  done();
}

export async function saveProfile(form: FormData): Promise<void> {
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return;
  const cat = str(form, "category_id");
  const v = {
    name,
    industry: str(form, "industry") || null,
    company_size: str(form, "company_size") || null,
    problem: str(form, "problem") || null,
    solution: str(form, "solution") || null,
    outcome: str(form, "outcome") || null,
    category_id: UUID.test(cat) ? cat : null,
  };
  if (UUID.test(id)) await sql`update proven_profiles set ${sql(v)} where id = ${id}`;
  else await sql`insert into proven_profiles ${sql(v)}`;
  done();
}

export async function deleteProfile(form: FormData): Promise<void> {
  const id = str(form, "id");
  if (UUID.test(id)) await sql`delete from proven_profiles where id = ${id}`;
  done();
}

export async function generateAction(_prev: Msg, form: FormData): Promise<Msg> {
  const one = str(form, "profile_id");
  try {
    const profileIds = UUID.test(one) ? [one] : (await sql<{ id: string }[]>`select id from proven_profiles`).map((r) => r.id);
    if (!profileIds.length) return { ok: false, message: "Add a proven customer profile first." };
    const personas = (await loadTargeting()).personas.filter((p) => p.active);
    const r = await generateFromProfiles(profileIds, personas);
    done();
    return r.added.length
      ? { ok: true, message: `Added ${r.added.length}: ${r.added.join(", ")}. Re-sort signals to use them.` }
      : { ok: true, message: `No new sub-categories: the existing ones already cover these customers${r.skipped ? ` (${r.skipped} duplicates skipped)` : ""}.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 200) };
  }
}

/** Re-sort the last 45 days of relevant signals with the current categories. */
export async function resortAction(_prev: Msg): Promise<Msg> {
  await sql`update signals set sorted_at = null where status = 'analyzed' and coalesce(published_at, fetched_at) >= now() - interval '45 days'`;
  const out = await runJob(sortSignals);
  done();
  if (!out.ok) return { ok: false, message: out.error ?? "failed" };
  const s = out.result?.stats as { sorted?: number; unsorted?: number } | undefined;
  return { ok: true, message: `Sorted ${s?.sorted ?? 0} signals (${s?.unsorted ?? 0} fit no category).` };
}
