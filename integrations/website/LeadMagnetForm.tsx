"use client";
/**
 * Lead-magnet download form for renesistech.jp (Next.js + Tailwind).
 *
 * Render it under every blog post in the 資料ダウンロード category:
 *   <LeadMagnetForm slug={post.slug} title={post.title} />
 *
 * Env (public, set in the website's hosting):
 *   NEXT_PUBLIC_LEAD_FORM_WEBHOOK      Make.com custom-webhook URL
 *   NEXT_PUBLIC_LEAD_MAGNET_BASE_URL   e.g. https://<project>.supabase.co/storage/v1/object/public/lead-magnets
 *
 * Sends one JSON POST to Make. Make adds the contact in Brevo and emails the download link.
 * Copied from the signal-to-lead-os repo (integrations/website); keep the payload fields in sync with src/lib/make.ts.
 */
import { useEffect, useState, type FormEvent } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const WEBHOOK = process.env.NEXT_PUBLIC_LEAD_FORM_WEBHOOK ?? "";
const BASE = (process.env.NEXT_PUBLIC_LEAD_MAGNET_BASE_URL ?? "").replace(/\/$/, "");
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
const CONSENT_TEXT = "プライバシーポリシーに同意のうえ、資料送付およびRenesis Techからのご案内メールの受信に同意します。";

type Utm = Record<(typeof UTM_KEYS)[number], string>;

/** First-touch UTMs for this browser session, so later page views don't overwrite them. */
function readUtm(): Utm {
  const empty = { utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "" };
  try {
    const url = new URL(window.location.href);
    const fromUrl = Object.fromEntries(UTM_KEYS.map((k) => [k, url.searchParams.get(k) ?? ""])) as Utm;
    if (fromUrl.utm_source) {
      sessionStorage.setItem("rt_utm", JSON.stringify(fromUrl));
      return fromUrl;
    }
    return { ...empty, ...JSON.parse(sessionStorage.getItem("rt_utm") ?? "{}") };
  } catch {
    return empty;
  }
}

export function LeadMagnetForm({ slug, title }: { slug: string; title: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [utm, setUtm] = useState<Utm | null>(null);
  useEffect(() => setUtm(readUtm()), []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (String(f.get("website") ?? "")) return; // bot filled the honeypot
    setState("sending");
    try {
      const res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_kind: "lead_magnet",
          email: String(f.get("email") ?? "").trim(),
          name: String(f.get("name") ?? "").trim(),
          company: String(f.get("company") ?? "").trim(),
          job_title: String(f.get("job_title") ?? "").trim(),
          consent: f.get("consent") === "on",
          consent_text: CONSENT_TEXT,
          magnet_slug: slug,
          magnet_title: title,
          download_url: `${BASE}/${slug}.pdf`,
          page_url: window.location.href,
          referrer: document.referrer,
          ...(utm ?? readUtm()),
          submitted_at: new Date().toISOString(),
          website: "",
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      window.gtag?.("event", "generate_lead", { form_kind: "lead_magnet", content_slug: slug });
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <p className="font-bold">お申し込みありがとうございます。</p>
        <p className="mt-2 text-sm">ご入力いただいたメールアドレスに、ダウンロードリンクをお送りしました。数分経っても届かない場合は、迷惑メールフォルダをご確認ください。</p>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-gray-900 focus:outline-none";
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-lg font-bold">無料で資料をダウンロード</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          お名前 <span className="text-red-600">*</span>
          <input name="name" required autoComplete="name" className={`mt-1 ${input}`} />
        </label>
        <label className="block text-sm">
          会社名 <span className="text-red-600">*</span>
          <input name="company" required autoComplete="organization" className={`mt-1 ${input}`} />
        </label>
        <label className="block text-sm">
          部署・役職
          <input name="job_title" autoComplete="organization-title" className={`mt-1 ${input}`} />
        </label>
        <label className="block text-sm">
          会社のメールアドレス <span className="text-red-600">*</span>
          <input name="email" type="email" required autoComplete="email" className={`mt-1 ${input}`} />
        </label>
      </div>
      {/* honeypot: hidden from people, bots tend to fill it */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input name="consent" type="checkbox" required className="mt-1" />
        <span>
          <a href="/privacy" target="_blank" className="underline">プライバシーポリシー</a>
          に同意のうえ、資料送付およびRenesis Techからのご案内メールの受信に同意します。
        </span>
      </label>
      <button
        disabled={state === "sending" || !WEBHOOK}
        className="w-full rounded-lg bg-gray-900 px-6 py-3 font-bold text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {state === "sending" ? "送信中…" : "資料をメールで受け取る"}
      </button>
      {state === "error" && <p className="text-sm text-red-600">送信できませんでした。時間をおいて再度お試しください。</p>}
    </form>
  );
}
