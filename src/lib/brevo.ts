// Brevo (free tier) — contact list, attributes and the lead-magnet delivery email template.
// Make.com uses the ids created here; the daily sync reads delivery events back.
import "server-only";
import { env, has } from "./env";
import { getSetting, setSetting } from "./settings";

const API = "https://api.brevo.com/v3";
export const LIST_NAME = "資料ダウンロード (Signal-to-Lead)";
const FOLDER_NAME = "Signal-to-Lead OS";
const TEMPLATE_NAME = "Signal-to-Lead: lead magnet delivery";

// Contact attributes written by the Make scenario.
export const ATTRIBUTES = ["COMPANY", "JOB_TITLE", "LAST_MAGNET", "SIGNUP_PAGE", "UTM_SOURCE", "UTM_MEDIUM", "UTM_CAMPAIGN", "CONSENT_AT"] as const;

export type BrevoSetup = { folderId: number; listId: number; templateId: number; senderEmail: string; at: string };

export async function brevoFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!has(env.brevoApiKey)) throw new Error("BREVO_API_KEY not set (SETUP.md §7)");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "api-key": env.brevoApiKey, accept: "application/json", "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new BrevoError(`${res.status}: ${body.message ?? res.statusText}`, res.status, body.code);
  return body as T;
}

export class BrevoError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export const getBrevoSetup = () => getSetting<BrevoSetup>("brevo");

function templateHtml(): string {
  // Brevo template language: {{ params.x }}
  return `<!doctype html><html lang="ja"><body style="margin:0;background:#f4f6f9;font-family:'Hiragino Sans','Noto Sans JP',Meiryo,sans-serif;color:#1b2333">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#0f3d5e;color:#ffffff;padding:20px 28px;font-weight:700;letter-spacing:.08em">RENESIS TECH</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.8">
<p style="margin:0 0 16px">{{ params.name }} 様</p>
<p style="margin:0 0 16px">この度は資料をご請求いただき、誠にありがとうございます。<br>下記のボタンから「{{ params.title }}」をダウンロードいただけます。</p>
<p style="margin:24px 0;text-align:center"><a href="{{ params.download_url }}" style="display:inline-block;background:#14a38b;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:6px">資料をダウンロードする</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#5b6475">ボタンが開けない場合は、こちらのURLをブラウザに貼り付けてください：<br><a href="{{ params.download_url }}" style="color:#0f3d5e;word-break:break-all">{{ params.download_url }}</a></p>
<hr style="border:0;border-top:1px solid #e3e7ee;margin:24px 0">
<p style="margin:0 0 12px">資料の内容を自社に当てはめて整理したい場合は、無料のAI業務診断もご利用ください。</p>
<p style="margin:0"><a href="https://renesistech.jp/ai-shindan" style="color:#0f3d5e;font-weight:700">無料AI業務診断を受ける →</a></p>
</td></tr>
<tr><td style="padding:18px 28px;background:#f8fafc;font-size:12px;color:#8a93a3;line-height:1.7">
Renesis Tech｜<a href="https://renesistech.jp" style="color:#8a93a3">renesistech.jp</a><br>
本メールは renesistech.jp の資料請求フォームからお申し込みいただいた方にお送りしています。お心当たりのない場合は、本メールを破棄してください。
</td></tr></table></td></tr></table></body></html>`;
}

/** Idempotent: creates whatever is missing and stores the ids. */
export async function ensureBrevoSetup(): Promise<BrevoSetup> {
  if (!has(env.brevoSenderEmail)) throw new Error("BREVO_SENDER_EMAIL not set: use a sender verified in Brevo (SETUP.md §7)");

  for (const name of ATTRIBUTES) {
    try {
      await brevoFetch(`/contacts/attributes/normal/${name}`, {
        method: "POST",
        body: JSON.stringify({ type: name === "CONSENT_AT" ? "date" : "text" }),
      });
    } catch (err) {
      // 400 "already exists" is fine
      if (!(err instanceof BrevoError && err.status === 400)) throw err;
    }
  }

  const folders = await brevoFetch<{ folders?: { id: number; name: string }[] }>(`/contacts/folders?limit=50&offset=0`);
  const folderId =
    folders.folders?.find((f) => f.name === FOLDER_NAME)?.id ??
    (await brevoFetch<{ id: number }>(`/contacts/folders`, { method: "POST", body: JSON.stringify({ name: FOLDER_NAME }) })).id;

  const lists = await brevoFetch<{ lists?: { id: number; name: string }[] }>(`/contacts/lists?limit=50&offset=0`);
  const listId =
    lists.lists?.find((l) => l.name === LIST_NAME)?.id ??
    (await brevoFetch<{ id: number }>(`/contacts/lists`, { method: "POST", body: JSON.stringify({ name: LIST_NAME, folderId }) })).id;

  const template = {
    templateName: TEMPLATE_NAME,
    subject: "【資料ダウンロード】{{ params.title }}",
    htmlContent: templateHtml(),
    sender: { name: env.brevoSenderName, email: env.brevoSenderEmail },
    isActive: true,
  };
  const templates = await brevoFetch<{ templates?: { id: number; name: string }[] }>(`/smtp/templates?limit=100&offset=0`);
  let templateId = templates.templates?.find((t) => t.name === TEMPLATE_NAME)?.id;
  if (templateId) {
    await brevoFetch(`/smtp/templates/${templateId}`, { method: "PUT", body: JSON.stringify(template) });
  } else {
    templateId = (await brevoFetch<{ id: number }>(`/smtp/templates`, { method: "POST", body: JSON.stringify(template) })).id;
  }

  const setup: BrevoSetup = { folderId, listId, templateId, senderEmail: env.brevoSenderEmail, at: new Date().toISOString() };
  await setSetting("brevo", setup);
  return setup;
}

export type DeliveryEvent = { email: string; date: string; messageId: string; subject?: string; tag?: string; tags?: string[] };

/** Delivery-email "requests" (one per download) from the last `days` days. */
export async function deliveryEvents(templateId: number, days: number): Promise<DeliveryEvent[]> {
  const out: DeliveryEvent[] = [];
  for (let offset = 0; offset < 10_000; offset += 2500) {
    const r = await brevoFetch<{ events?: DeliveryEvent[] }>(
      `/smtp/statistics/events?templateId=${templateId}&event=requests&days=${days}&limit=2500&offset=${offset}&sort=desc`,
    );
    const page = r.events ?? [];
    out.push(...page);
    if (page.length < 2500) break;
  }
  return out;
}

export async function contactAttributes(email: string): Promise<Record<string, string>> {
  try {
    const c = await brevoFetch<{ attributes?: Record<string, string> }>(`/contacts/${encodeURIComponent(email)}`);
    return c.attributes ?? {};
  } catch {
    return {};
  }
}
