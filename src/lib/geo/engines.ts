// AI search engines we can ask a question and read the cited sources from. Each switches on when
// its key is set. Tavily has a free tier (1,000 requests/month); the others are paid but cheap.
import { env, has } from "../env";

export type Citation = { url: string; title: string; domain: string };
export type EngineResult = { answer: string; citations: Citation[] };
export type EngineKey = "tavily" | "perplexity" | "openai" | "gemini";

export const ENGINES: Record<EngineKey, { label: string; stands_for: string; free: boolean; key: string; how: string }> = {
  tavily: { label: "Tavily (AI search)", stands_for: "AI search engines in general", free: true, key: "TAVILY_API_KEY", how: "Free 1,000 requests/month at tavily.com → API key" },
  perplexity: { label: "Perplexity", stands_for: "Perplexity", free: false, key: "PERPLEXITY_API_KEY", how: "perplexity.ai → API → Sonar (about $1–3/month for this use)" },
  openai: { label: "ChatGPT search", stands_for: "ChatGPT", free: false, key: "OPENAI_API_KEY", how: "platform.openai.com → API key (web search, about $2–5/month)" },
  gemini: { label: "Gemini + Google Search", stands_for: "Gemini / Google AI Overviews", free: false, key: "GEMINI_GROUNDING=on", how: "Enable billing on the Gemini key (a daily free allowance usually keeps it at ¥0), then set GEMINI_GROUNDING=on" },
};

export function enabledEngines(): EngineKey[] {
  return (Object.keys(ENGINES) as EngineKey[]).filter((k) =>
    k === "tavily" ? has(env.tavilyApiKey) : k === "perplexity" ? has(env.perplexityApiKey) : k === "openai" ? has(env.openaiApiKey) : env.geminiGrounding === "on" && has(env.geminiApiKey));
}

export const domainOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
};
const cite = (url: string, title = ""): Citation => ({ url, title, domain: domainOf(url) });
const T = 60_000;

async function post<J>(url: string, headers: Record<string, string>, body: unknown): Promise<J> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(T) });
  const j = (await res.json().catch(() => ({}))) as J & { error?: { message?: string } | string };
  if (!res.ok) throw new Error(`${res.status} ${typeof j.error === "string" ? j.error : j.error?.message ?? res.statusText}`.slice(0, 200));
  return j;
}

export async function askEngine(engine: EngineKey, question: string): Promise<EngineResult> {
  switch (engine) {
    case "tavily": {
      const j = await post<{ answer?: string; results?: { url: string; title: string }[] }>(
        "https://api.tavily.com/search", { Authorization: `Bearer ${env.tavilyApiKey}` },
        { query: question, search_depth: "basic", include_answer: true, max_results: 10, country: "japan", topic: "general" },
      );
      return { answer: j.answer ?? "", citations: (j.results ?? []).map((r) => cite(r.url, r.title)) };
    }
    case "perplexity": {
      const j = await post<{ choices?: { message?: { content?: string } }[]; citations?: string[]; search_results?: { url: string; title?: string }[] }>(
        "https://api.perplexity.ai/chat/completions", { Authorization: `Bearer ${env.perplexityApiKey}` },
        { model: "sonar", messages: [{ role: "user", content: question }], web_search_options: { user_location: { country: "JP" } } },
      );
      const results = j.search_results?.length ? j.search_results.map((r) => cite(r.url, r.title)) : (j.citations ?? []).map((u) => cite(u));
      return { answer: j.choices?.[0]?.message?.content ?? "", citations: results };
    }
    case "openai": {
      type Ann = { type: string; url?: string; title?: string };
      const j = await post<{ output?: { type: string; content?: { type: string; text?: string; annotations?: Ann[] }[] }[] }>(
        "https://api.openai.com/v1/responses", { Authorization: `Bearer ${env.openaiApiKey}` },
        { model: env.openaiGeoModel, tools: [{ type: "web_search", user_location: { type: "approximate", country: "JP" } }], input: question },
      );
      const parts = (j.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
      const anns = parts.flatMap((c) => c.annotations ?? []).filter((a) => a.type === "url_citation" && a.url);
      const seen = new Set<string>();
      return {
        answer: parts.map((c) => c.text ?? "").join("\n"),
        citations: anns.filter((a) => (seen.has(a.url!) ? false : (seen.add(a.url!), true))).map((a) => cite(a.url!, a.title)),
      };
    }
    case "gemini": {
      const j = await post<{ candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[] }>(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent", { "x-goog-api-key": env.geminiApiKey },
        { contents: [{ role: "user", parts: [{ text: question }] }], tools: [{ google_search: {} }] },
      );
      const c = j.candidates?.[0];
      // Gemini returns redirect URLs; the title holds the real site's domain.
      const chunks = (c?.groundingMetadata?.groundingChunks ?? []).map((g) => ({ url: g.web?.uri ?? "", title: g.web?.title ?? "", domain: (g.web?.title ?? "").replace(/^www\./, "") }));
      return { answer: (c?.content?.parts ?? []).map((p) => p.text ?? "").join(""), citations: chunks };
    }
  }
}
