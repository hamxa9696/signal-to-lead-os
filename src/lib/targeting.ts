// Who the content is for: services (with focus flag), target industries and personas.
// Edited on /audience; turned into a prompt block for Gemini and the prompt packs.
import { sql } from "./db";

export type Service = { id: string; slug: string; name_ja: string; name_en: string; description: string | null; focus: boolean; active: boolean; category_id: string | null };
export type Industry = { id: string; name_ja: string; name_en: string; priority: "high" | "normal" | "low"; notes: string | null; active: boolean };
export type Persona = {
  id: string;
  tier: "pcp" | "ricp" | "sicp";
  name: string;
  description: string | null;
  pains: string | null;
  industries: string[];
  service_ids: string[];
  active: boolean;
};
export type Targeting = { services: Service[]; industries: Industry[]; personas: Persona[] };

export const TIER_LABEL: Record<Persona["tier"], string> = { pcp: "Primary", ricp: "Secondary", sicp: "Occasional" };

export async function loadTargeting(): Promise<Targeting> {
  const [services, industries, personas] = await Promise.all([
    sql<Service[]>`select id, slug, name_ja, name_en, description, focus, active, category_id from services order by focus desc, name_en`,
    sql<Industry[]>`select id, name_ja, name_en, priority, notes, active from industries
                    order by case priority when 'high' then 0 when 'normal' then 1 else 2 end, name_ja`,
    sql<Persona[]>`select id, tier, name, description, pains, industries, service_ids, active from icps
                   order by case tier when 'pcp' then 0 when 'ricp' then 1 else 2 end, created_at`,
  ]);
  return { services, industries, personas };
}

/** Active personas in prompt order; the index in this list is what Gemini returns as persona_ref. */
export const activePersonas = (t: Targeting) => t.personas.filter((p) => p.active);

/** Prompt block describing services, industries and personas (English labels, Japanese content). */
export function targetingBrief(t: Targeting): string {
  const svcName = new Map(t.services.map((s) => [s.id, s.name_ja]));
  const services = t.services.filter((s) => s.active);
  const industries = t.industries.filter((i) => i.active);
  const personas = activePersonas(t);
  return [
    "SERVICES WE SELL (★ = current focus; prefer these):",
    ...services.map((s) => `- ${s.slug}: ${s.name_ja}${s.focus ? " ★" : ""}${s.description ? ` — ${s.description}` : ""}`),
    "",
    "TARGET INDUSTRIES (priority in brackets; favour high):",
    ...(industries.length ? industries.map((i) => `- ${i.name_ja}${i.name_en ? ` (${i.name_en})` : ""} [${i.priority}]${i.notes ? ` — ${i.notes}` : ""}`) : ["- (any)"]),
    "",
    "PERSONAS (who we write for; [index] tier):",
    ...(personas.length
      ? personas.map((p, i) =>
          [
            `[${i}] ${TIER_LABEL[p.tier]} — ${p.name}`,
            p.description && `    人物像: ${p.description}`,
            p.pains && `    課題: ${p.pains}`,
            p.industries.length && `    業界: ${p.industries.join("、")}`,
            p.service_ids.length && `    関心サービス: ${p.service_ids.map((id) => svcName.get(id)).filter(Boolean).join("、")}`,
          ].filter(Boolean).join("\n"))
      : ["- (none defined)"]),
  ].join("\n");
}
