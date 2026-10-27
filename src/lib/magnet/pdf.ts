// Lead magnet Markdown → branded A4 PDF, rendered by the local Chrome (puppeteer-core).
import "server-only";
import { mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marked } from "marked";
import puppeteer from "puppeteer-core";
import { env } from "@/lib/env";
import type { Frontmatter } from "@/lib/content/draft";

// Vercel functions can only write to /tmp (and it doesn't persist), so PDFs are uploaded right after.
export const EXPORT_DIR = process.env.VERCEL ? join(tmpdir(), "lead-magnets") : join(process.cwd(), "exports", "lead-magnets");

async function launchBrowser() {
  if (process.env.VERCEL) {
    // Serverless: bundled headless Chromium.
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  }
  return puppeteer.launch({ executablePath: env.chromePath, headless: true, args: ["--no-first-run"] });
}
const SITE = "https://renesistech.jp";

const FORMAT_LABEL: Record<string, string> = {
  checklist: "チェックリスト",
  calculator: "計算シート",
  comparison: "比較ガイド",
  template: "テンプレート",
  mini_report: "ミニレポート",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function magnetHtml(p: {
  fm: Frontmatter;
  body: string;
  format: string | null;
  serviceName: string | null;
  serviceUrl: string | null;
}): string {
  const content = marked.parse(p.body.replace(/</g, "&lt;"), { async: false }) as string;
  const date = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", timeZone: "Asia/Tokyo" }).format(new Date());
  const label = FORMAT_LABEL[p.format ?? ""] ?? "資料";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  @page :first { margin: 0; }
  :root { --ink:#1b2333; --muted:#5b6475; --brand:#0f3d5e; --accent:#14a38b; --line:#e3e7ee; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans JP", "Hiragino Sans", sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.85; margin: 0; }
  .cover { height: 296mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always;
           background: linear-gradient(160deg, var(--brand) 0%, #0a2840 100%); color: #fff; padding: 34mm 24mm 30mm; }
  .cover .brand { font-weight: 700; letter-spacing: .08em; font-size: 11pt; }
  .cover .tag { display: inline-block; border: 1px solid rgba(255,255,255,.5); border-radius: 999px; padding: 2mm 5mm; font-size: 9.5pt; margin-bottom: 8mm; }
  .cover h1 { font-size: 25pt; line-height: 1.45; margin: 0 0 8mm; font-weight: 700; text-wrap: balance; word-break: auto-phrase; }
  .cover .lead { font-size: 11pt; color: rgba(255,255,255,.85); max-width: 150mm; }
  .cover .foot { font-size: 9pt; color: rgba(255,255,255,.7); display: flex; justify-content: space-between; }
  .cover .bar { height: 2mm; width: 40mm; background: var(--accent); margin-bottom: 10mm; }
  main h2, main h3 { word-break: auto-phrase; }
  main h2 { font-size: 14.5pt; color: var(--brand); border-left: 4px solid var(--accent); padding-left: 3mm; margin: 9mm 0 3mm; page-break-after: avoid; }
  main h3 { font-size: 11.5pt; margin: 6mm 0 2mm; page-break-after: avoid; }
  main p { margin: 2mm 0; }
  main ul, main ol { padding-left: 6mm; margin: 2mm 0; }
  main li { margin: 1mm 0; page-break-inside: avoid; }
  main.checklist ul { list-style: none; padding-left: 0; }
  main.checklist ul > li { position: relative; padding: 2mm 0 2mm 9mm; border-bottom: 1px solid var(--line); }
  main.checklist ul > li::before { content: ""; position: absolute; left: 1mm; top: 3.2mm; width: 4mm; height: 4mm; border: 1.5px solid var(--brand); border-radius: 1mm; }
  table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 2mm 2.5mm; text-align: left; vertical-align: top; }
  th { background: #f3f6fa; }
  strong { color: var(--brand); }
  a { color: var(--brand); }
  .cta { page-break-before: always; border: 1px solid var(--line); border-radius: 3mm; padding: 10mm; margin-top: 10mm; }
  .cta h2 { border: 0; padding: 0; margin-top: 0; }
  .cta .btn { display: inline-block; background: var(--accent); color: #fff; text-decoration: none; padding: 3mm 6mm; border-radius: 2mm; font-weight: 700; margin: 2mm 3mm 2mm 0; }
  .cta .small { color: var(--muted); font-size: 9pt; }
</style></head><body>
<section class="cover">
  <div class="brand">RENESIS TECH</div>
  <div>
    <div class="bar"></div>
    <div class="tag">${esc(label)}</div>
    <h1>${esc(p.fm.title ?? "")}</h1>
    <div class="lead">${esc(p.fm.landing_lead ?? p.fm.excerpt ?? "")}</div>
  </div>
  <div class="foot"><span>${esc(date)}</span><span>renesistech.jp</span></div>
</section>
<main class="${p.format === "checklist" ? "checklist" : ""}">${content}</main>
<section class="cta">
  <h2>次の一歩を、一緒に考えませんか</h2>
  <p>この資料の内容を自社に当てはめるとどうなるか、無料のAI業務診断で整理できます。${p.serviceName ? `「${esc(p.serviceName)}」のご相談も承っています。` : ""}</p>
  <p>
    <a class="btn" href="${SITE}/ai-shindan">無料AI業務診断を受ける</a>
    ${p.serviceUrl ? `<a class="btn" style="background:var(--brand)" href="${esc(p.serviceUrl)}">${esc(p.serviceName ?? "サービス詳細")}</a>` : ""}
  </p>
  <p class="small">Renesis Tech｜${SITE}｜お問い合わせ: ${SITE}/contact</p>
</section>
</body></html>`;
}

export async function renderPdf(html: string, slug: string): Promise<{ path: string; bytes: number; pages: number }> {
  mkdirSync(EXPORT_DIR, { recursive: true });
  const path = join(EXPORT_DIR, `${slug}.pdf`);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      path,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-size:7.5pt;color:#8a93a3;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif">' +
        '<span>Renesis Tech｜renesistech.jp</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
    const pages = (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    return { path, bytes: statSync(path).size, pages };
  } finally {
    await browser.close();
  }
}
