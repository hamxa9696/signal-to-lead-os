// Fetch a news article and pull out its readable text. Handles Shift_JIS / EUC-JP pages,
// which are still common on Japanese news sites.
const USER_AGENT = "Mozilla/5.0 (compatible; RenesisSignalBot/0.2; +https://renesistech.jp)";
const MAX_CHARS = 8_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function charsetOf(contentType: string | null, head: string): string {
  const m = /charset=["']?([\w-]+)/i.exec(contentType ?? "") ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  const c = (m?.[1] ?? "utf-8").toLowerCase();
  return c === "shift-jis" || c === "sjis" || c === "x-sjis" ? "shift_jis" : c;
}

/** Readable text from article HTML: the <article> (or <main>/<body>) paragraphs, without chrome. */
export function extractText(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, "");
  h = h.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  const scope = /<article\b[\s\S]*<\/article>/i.exec(h)?.[0] ?? /<main\b[\s\S]*<\/main>/i.exec(h)?.[0] ?? h;
  const paras = [...scope.matchAll(/<(p|h2|h3|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 25 && !/cookie|javascript|copyright|all rights reserved/i.test(t));
  return [...new Set(paras)].join("\n").slice(0, MAX_CHARS);
}

export async function fetchArticle(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "ja,en;q=0.5" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  let html: string;
  try {
    html = new TextDecoder(charsetOf(res.headers.get("content-type"), head)).decode(bytes);
  } catch {
    html = new TextDecoder("utf-8").decode(bytes);
  }
  return extractText(html);
}

/** Google News links are JS redirects we cannot follow without a browser. */
export const isFetchable = (url: string | null): url is string => !!url && !/^https?:\/\/news\.google\.com\//.test(url);
