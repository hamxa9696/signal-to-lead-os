// Gemini free-tier client. Used for signal analysis, topic scoring and the AI review pass.
// Never send client/CRM personal data through the free tier.
import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { env, has } from "./env";

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!has(env.geminiApiKey)) throw new Error("GEMINI_API_KEY not set");
  client ??= new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

export const GEMINI_MODEL = env.geminiModel;

function responseText(res: unknown): string {
  const r = res as { text?: unknown };
  if (typeof r.text === "function") return (r.text as () => string)();
  if (typeof r.text === "string") return r.text;
  throw new Error("Gemini returned no text");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask Gemini for JSON and validate it. Retries on rate limits / overload with backoff
 * (free tier allows only a few requests per minute).
 */
export async function generateJson<S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts: { temperature?: number; attempts?: number } = {},
): Promise<z.infer<S>> {
  const attempts = opts.attempts ?? 4;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await gemini().models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: opts.temperature ?? 0.2 },
      });
      const parsed = schema.safeParse(JSON.parse(responseText(res)));
      if (parsed.success) return parsed.data;
      lastErr = new Error(`Gemini JSON did not match schema: ${parsed.error.issues.slice(0, 3).map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error).message ?? err);
      const retryable = /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded|fetch failed/i.test(msg);
      if (!retryable && !(err instanceof SyntaxError)) throw err;
    }
    if (i < attempts - 1) await sleep(15_000 * (i + 1)); // 15s, 30s, 45s
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
