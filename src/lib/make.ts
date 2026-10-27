// The JSON the website form sends to the Make.com webhook. Also used for the "send test" button,
// which Make needs once to learn the data structure.
import "server-only";
import { env, has } from "./env";

export type FormPayload = {
  form_kind: "lead_magnet" | "inquiry" | "newsletter";
  email: string;
  name: string;
  company: string;
  job_title: string;
  consent: boolean;
  consent_text: string;
  magnet_slug: string;
  magnet_title: string;
  download_url: string;
  page_url: string;
  referrer: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  submitted_at: string;
  website: string; // honeypot: must be empty
};

export function samplePayload(downloadBase: string | null): FormPayload {
  return {
    form_kind: "lead_magnet",
    email: "test@example.com",
    name: "テスト 太郎",
    company: "テスト株式会社",
    job_title: "情報システム部 部長",
    consent: true,
    consent_text: "個人情報の取り扱いに同意します",
    magnet_slug: "sample-checklist",
    magnet_title: "サンプル資料",
    download_url: `${downloadBase ?? "https://example.com/lead-magnets"}/sample-checklist.pdf`,
    page_url: "https://renesistech.jp/blog/sample-checklist",
    referrer: "https://www.google.com/",
    utm_source: "linkedin",
    utm_medium: "social",
    utm_campaign: "sample-checklist",
    utm_content: "",
    submitted_at: new Date().toISOString(),
    website: "",
  };
}

export async function sendTestToMake(payload: FormPayload): Promise<string> {
  if (!has(env.makeWebhookUrl)) throw new Error("MAKE_WEBHOOK_URL not set (SETUP.md §8)");
  const res = await fetch(env.makeWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  return `${res.status} ${(await res.text()).slice(0, 120)}`;
}
