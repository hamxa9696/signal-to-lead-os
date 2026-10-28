// Service categories → sub-categories (industry use-cases). Edited on /categories, used by Gemini
// to sort signals and by the Signals page to organise them.
import { z } from "zod";
import { sql } from "./db";
import { generateJson } from "./gemini";

export type Category = { id: string; slug: string; name_en: string; name_ja: string; description: string | null; color: string; sort: number; active: boolean };
export type Subcategory = {
  id: string; category_id: string; slug: string; name_en: string; name_ja: string; industry: string | null;
  description: string | null; keywords: string[]; persona_ids: string[]; origin: "manual" | "ai" | "seed"; profile_id: string | null; active: boolean;
};
export type Profile = {
  id: string; name: string; industry: string | null; company_size: string | null; problem: string | null;
  solution: string | null; outcome: string | null; category_id: string | null; generated_at: Date | null;
};
export type Taxonomy = { categories: Category[]; subcategories: Subcategory[] };

export async function loadTaxonomy(): Promise<Taxonomy> {
  const [categories, subcategories] = await Promise.all([
    sql<Category[]>`select id, slug, name_en, name_ja, description, color, sort, active from categories order by sort, name_en`,
    sql<Subcategory[]>`select id, category_id, slug, name_en, name_ja, industry, description, keywords, persona_ids, origin, profile_id, active
                       from subcategories order by name_en`,
  ]);
  return { categories, subcategories };
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `sub-${Date.now().toString(36)}`;

/** Prompt block: the sub-categories Gemini must choose from. */
export function taxonomyBrief(t: Taxonomy, personaName?: (id: string) => string | undefined): string {
  const cats = t.categories.filter((c) => c.active);
  return [
    "SUB-CATEGORIES (subcategory_slug must be one of these slugs, or null if none fits):",
    ...cats.flatMap((c) => {
      const subs = t.subcategories.filter((s) => s.active && s.category_id === c.id);
      return [
        `# ${c.name_en}${c.name_ja ? ` / ${c.name_ja}` : ""}${c.description ? ` — ${c.description}` : ""}`,
        ...(subs.length
          ? subs.map((s) => {
              const personas = personaName ? s.persona_ids.map(personaName).filter(Boolean).join("、") : "";
              return `- ${s.slug}: ${s.name_ja || s.name_en}${s.industry ? ` [${s.industry}]` : ""}${s.description ? ` — ${s.description}` : ""}${s.keywords.length ? ` (keywords: ${s.keywords.join("、")})` : ""}${personas ? ` (readers: ${personas})` : ""}`;
            })
          : [`- (no sub-categories yet: use category slug "${c.slug}")`]),
      ];
    }),
  ].join("\n");
}

/** Map a returned slug to {category_id, subcategory_id}. Accepts a bare category slug too. */
export function resolveSlug(t: Taxonomy, slug: string | null | undefined): { category_id: string | null; subcategory_id: string | null } {
  if (!slug) return { category_id: null, subcategory_id: null };
  const sub = t.subcategories.find((s) => s.active && s.slug === slug);
  if (sub) return { category_id: sub.category_id, subcategory_id: sub.id };
  const cat = t.categories.find((c) => c.active && c.slug === slug);
  return { category_id: cat?.id ?? null, subcategory_id: null };
}

// ---- Sub-categories from Proven Customer Profiles -------------------------------------------

const Suggested = z.preprocess((v) => (Array.isArray(v) ? { items: v } : v), z.object({
  items: z.array(z.object({
    category_slug: z.string(),
    name_en: z.string().min(3),
    name_ja: z.string().catch(""),
    industry: z.string().nullable().catch(null),
    description: z.string().catch(""),
    keywords: z.array(z.string()).catch([]),
    persona_refs: z.array(z.number().int()).catch([]),
  })),
}));

/**
 * Ask Gemini which sub-categories (industry × use-case) the proven customers imply, and add the
 * new ones (origin 'ai'). Existing sub-categories are shown so it extends rather than duplicates.
 */
export async function generateFromProfiles(profileIds: string[], personas: { id: string; name: string; description: string | null }[]): Promise<{ added: string[]; skipped: number }> {
  const profiles = await sql<Profile[]>`select * from proven_profiles where id in ${sql(profileIds)}`;
  if (!profiles.length) throw new Error("no profiles selected");
  const t = await loadTaxonomy();
  const catSlug = new Map(t.categories.map((c) => [c.id, c.slug]));

  const { items } = await generateJson(
    [
      "Renesis Tech Japan sells AI, blockchain/Web3, software, cloud and QA services to Japanese companies.",
      "Below are PROVEN CUSTOMER PROFILES: real customers who bought and got results. Derive the market",
      "SUB-CATEGORIES (an industry × use-case niche, e.g. 'Blockchain in real estate', 'AI for insurance claims')",
      "where more customers like these are likely to be found, so the team can watch news for each niche.",
      "",
      "Rules:",
      "- 1–3 sub-categories per profile; merge profiles that point to the same niche.",
      "- Do NOT repeat an EXISTING sub-category (same niche under a different name counts as a repeat).",
      "- category_slug: one of the CATEGORIES slugs.",
      "- name_en: short English name; name_ja: natural Japanese name (e.g. 不動産×ブロックチェーン).",
      "- industry: Japanese industry name or null if cross-industry.",
      "- description: 1–2 English sentences describing which NEWS belongs here (use cases, triggers, regulation).",
      "- keywords: 3–6 Japanese search phrases that news in this niche would contain.",
      "- persona_refs: [index] of the PERSONAS who read about this niche.",
      "",
      "CATEGORIES:",
      ...t.categories.filter((c) => c.active).map((c) => `- ${c.slug}: ${c.name_en}`),
      "",
      "EXISTING SUB-CATEGORIES:",
      ...(t.subcategories.length ? t.subcategories.map((s) => `- ${catSlug.get(s.category_id)} / ${s.name_en}${s.industry ? ` [${s.industry}]` : ""}`) : ["- (none)"]),
      "",
      "PERSONAS:",
      ...personas.map((p, i) => `[${i}] ${p.name}${p.description ? ` — ${p.description}` : ""}`),
      "",
      "PROVEN CUSTOMER PROFILES:",
      ...profiles.map((p) => [
        `## ${p.name}${p.category_id ? ` (category: ${catSlug.get(p.category_id)})` : ""}`,
        p.industry && `Industry: ${p.industry}`, p.company_size && `Size: ${p.company_size}`,
        p.problem && `Problem: ${p.problem}`, p.solution && `What we delivered: ${p.solution}`, p.outcome && `Outcome: ${p.outcome}`,
      ].filter(Boolean).join("\n")),
      "",
      'Return ONLY JSON: {"items":[{"category_slug":"","name_en":"","name_ja":"","industry":null,"description":"","keywords":[],"persona_refs":[]}]}',
    ].join("\n"),
    Suggested,
    { temperature: 0.3 },
  );

  const added: string[] = [];
  let skipped = 0;
  const existingNames = new Set(t.subcategories.map((s) => s.name_en.toLowerCase()));
  for (const it of items) {
    const cat = t.categories.find((c) => c.slug === it.category_slug);
    if (!cat || existingNames.has(it.name_en.toLowerCase())) {
      skipped++;
      continue;
    }
    let slug = slugify(it.name_en);
    if (t.subcategories.some((s) => s.slug === slug) || added.includes(slug)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const profile = profiles.length === 1 ? profiles[0].id : null;
    await sql`
      insert into subcategories ${sql({
        category_id: cat.id, slug, name_en: it.name_en, name_ja: it.name_ja, industry: it.industry,
        description: it.description || null, keywords: it.keywords.slice(0, 8),
        persona_ids: it.persona_refs.map((i) => personas[i]?.id).filter((x): x is string => !!x),
        origin: "ai", profile_id: profile,
      })}`;
    existingNames.add(it.name_en.toLowerCase());
    added.push(it.name_en);
  }
  await sql`update proven_profiles set generated_at = now() where id in ${sql(profileIds)}`;
  return { added, skipped };
}
