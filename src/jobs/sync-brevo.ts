// Pull lead-magnet deliveries from Brevo into form_submissions (one row per download).
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { contactAttributes, deliveryEvents, getBrevoSetup } from "@/lib/brevo";
import type { Job } from "./types";

export const syncBrevo: Job = {
  name: "sync-brevo",
  description: "Import lead-magnet download emails sent by Brevo as form submissions",
  async run() {
    if (!has(env.brevoApiKey)) return { status: "skipped", stats: {}, note: "BREVO_API_KEY not set (SETUP.md §7)" };
    const setup = await getBrevoSetup();
    if (!setup) return { status: "skipped", stats: {}, note: "run “Set up Brevo” on the Delivery page first" };

    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from form_submissions where form_kind = 'lead_magnet'`;
    const events = await deliveryEvents(setup.templateId, n === 0 ? 90 : 7);
    const magnets = await sql<{ slug: string; content_item_id: string }[]>`select slug, content_item_id from magnet_files`;
    const bySlug = new Map(magnets.map((m) => [m.slug, m.content_item_id]));

    let inserted = 0;
    for (const e of events) {
      if (!e.messageId || !e.email) continue;
      const [exists] = await sql`select 1 from form_submissions where external_id = ${e.messageId}`;
      if (exists) continue;
      const a = await contactAttributes(e.email);
      const slug = e.tag ?? e.tags?.[0] ?? a.LAST_MAGNET ?? "";
      await sql`
        insert into form_submissions (external_id, form_kind, received_at, email, name, company, content_item_id, page_url, utm, consent, raw)
        values (
          ${e.messageId}, 'lead_magnet', ${e.date}, ${e.email.toLowerCase()},
          ${a.FIRSTNAME ?? null}, ${a.COMPANY ?? null}, ${bySlug.get(slug) ?? null}, ${a.SIGNUP_PAGE ?? null},
          ${sql.json({ source: a.UTM_SOURCE ?? null, medium: a.UTM_MEDIUM ?? null, campaign: a.UTM_CAMPAIGN ?? null })},
          ${Boolean(a.CONSENT_AT)}, ${sql.json({ slug, subject: e.subject ?? null })}
        )
        on conflict (external_id) do nothing`;
      inserted++;
    }
    return { status: "ok", stats: { events: events.length, inserted } };
  },
};
