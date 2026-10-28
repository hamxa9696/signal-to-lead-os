import { sql } from "@/lib/db";
import { PageHeader } from "../page-header";
import { env, has } from "@/lib/env";
import { getBrevoSetup, LIST_NAME } from "@/lib/brevo";
import { downloadBaseUrl, storageReady } from "@/lib/magnet/storage";
import { CopyButton } from "../copy-button";
import { SetupBrevo, TestMake } from "./buttons";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Gemini and PDF actions can take minutes

type Sub = { received_at: Date; email: string | null; name: string | null; company: string | null; title: string | null; utm: { source?: string } | null };

const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(d);

function Row({ label, value, ok, hint }: { label: string; value?: string | number | null; ok: boolean; hint?: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-good-dot" : "bg-warn-dot"}`} />
      <span className="w-44 shrink-0 text-body">{label}</span>
      {value != null && value !== "" ? (
        <span className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 break-all text-ink">{value}</code>
          <CopyButton text={String(value)} label="Copy" />
        </span>
      ) : (
        <span className="text-faint">{hint}</span>
      )}
    </li>
  );
}

export default async function DeliveryPage() {
  const [setup, subs, [{ total }]] = await Promise.all([
    getBrevoSetup(),
    sql<Sub[]>`
      select fs.received_at, fs.email, fs.name, fs.company, ci.title, fs.utm
      from form_submissions fs left join content_items ci on ci.id = fs.content_item_id
      order by fs.received_at desc limit 50`,
    sql<{ total: number }[]>`select count(*)::int as total from form_submissions`,
  ]);
  const base = downloadBaseUrl();
  const storage = storageReady();
  const brevoKey = has(env.brevoApiKey);
  const sender = has(env.brevoSenderEmail);
  const make = has(env.makeWebhookUrl);

  return (
    <main className="page">
      <PageHeader
        eyebrow="Optional"
        title="Delivery"
        description={<>Only needed for emailed lead-magnet downloads (website form → Make.com → Brevo emails the PDF). The site&apos;s own forms already collect emails. Guides: <code>docs/MAKE.md</code>, <code>integrations/website/README.md</code>.</>}
      />

      <section>
        <h2 className="font-semibold">Values for Make.com and the website</h2>
        <ul className="mt-3 divide-y divide-line card text-sm">
          <Row label="Brevo LIST_ID" value={setup?.listId} ok={Boolean(setup)} hint={`click “Set up Brevo” (creates “${LIST_NAME}”)`} />
          <Row label="Brevo TEMPLATE_ID" value={setup?.templateId} ok={Boolean(setup)} hint="created by “Set up Brevo”" />
          <Row label="PDF base URL" value={base} ok={storage.ok} hint="set SUPABASE_URL (SETUP.md §9)" />
          <Row label="Make webhook" value={make ? "set in .env" : null} ok={make} hint="MAKE_WEBHOOK_URL not set (SETUP.md §8)" />
        </ul>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="font-semibold">1. Brevo</h2>
          <p className="mt-1 text-sm text-muted">Creates the contact fields, the downloads list and the Japanese delivery email template. Safe to run again.</p>
          {!brevoKey && <p className="mt-2 text-sm text-warn">BREVO_API_KEY not set (SETUP.md §7)</p>}
          {brevoKey && !sender && <p className="mt-2 text-sm text-warn">BREVO_SENDER_EMAIL not set: use a sender you verified in Brevo</p>}
          <div className="mt-3"><SetupBrevo disabled={!brevoKey || !sender} again={Boolean(setup)} /></div>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold">2. Make.com</h2>
          <p className="mt-1 text-sm text-muted">
            Sends one sample submission (test@example.com) to your webhook so Make can learn the fields. In Make, click “Re-determine data structure” first.
          </p>
          <div className="mt-3"><TestMake disabled={!make} /></div>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Downloads ({total})</h2>
        <p className="mt-1 text-sm text-faint">Imported daily from Brevo’s delivery emails (job: sync-brevo).</p>
        <div className="mt-3 overflow-x-auto card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-faint">
              <tr>
                <th className="px-3 py-2 font-normal">When (JST)</th>
                <th className="px-3 py-2 font-normal">Name / company</th>
                <th className="px-3 py-2 font-normal">Email</th>
                <th className="px-3 py-2 font-normal">Lead magnet</th>
                <th className="px-3 py-2 font-normal">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {subs.map((s, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{fmt(s.received_at)}</td>
                  <td lang="ja" className="px-3 py-2">{s.name ?? "-"}<span className="text-faint"> · {s.company ?? "-"}</span></td>
                  <td className="px-3 py-2 text-body">{s.email}</td>
                  <td lang="ja" className="px-3 py-2 text-body">{s.title ?? "-"}</td>
                  <td className="px-3 py-2 text-faint">{s.utm?.source ?? "direct"}</td>
                </tr>
              ))}
              {!subs.length && <tr><td colSpan={5} className="px-3 py-4 text-faint">No downloads yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
