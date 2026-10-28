"use server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

const UUID = /^[0-9a-f-]{36}$/;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = () => revalidatePath("/audience");

export async function saveService(form: FormData): Promise<void> {
  const id = str(form, "id");
  if (!UUID.test(id)) return;
  await sql`update services set description = ${str(form, "description") || null},
            focus = ${form.get("focus") === "on"}, active = ${form.get("active") === "on"} where id = ${id}`;
  done();
}

export async function saveIndustry(form: FormData): Promise<void> {
  const id = str(form, "id");
  const name_ja = str(form, "name_ja");
  if (!name_ja) return;
  const priority = ["high", "normal", "low"].includes(str(form, "priority")) ? str(form, "priority") : "normal";
  const v = { name_ja, name_en: str(form, "name_en"), priority, notes: str(form, "notes") || null, active: id ? form.get("active") === "on" : true };
  if (UUID.test(id)) await sql`update industries set ${sql(v)} where id = ${id}`;
  else await sql`insert into industries ${sql(v)}`;
  done();
}

export async function deleteIndustry(form: FormData): Promise<void> {
  const id = str(form, "id");
  if (UUID.test(id)) await sql`delete from industries where id = ${id}`;
  done();
}

export async function savePersona(form: FormData): Promise<void> {
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return;
  const tier = ["pcp", "ricp", "sicp"].includes(str(form, "tier")) ? str(form, "tier") : "pcp";
  const v = {
    tier,
    name,
    description: str(form, "description") || null,
    pains: str(form, "pains") || null,
    industries: form.getAll("industries").map(String).filter(Boolean),
    service_ids: form.getAll("service_ids").map(String).filter((s) => UUID.test(s)),
    active: id ? form.get("active") === "on" : true,
  };
  if (UUID.test(id)) await sql`update icps set ${sql(v)} where id = ${id}`;
  else await sql`insert into icps ${sql(v)}`;
  done();
}

export async function deletePersona(form: FormData): Promise<void> {
  const id = str(form, "id");
  if (UUID.test(id)) await sql`delete from icps where id = ${id}`;
  done();
}
