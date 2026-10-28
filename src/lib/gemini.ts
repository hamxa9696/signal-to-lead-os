// Gemini free-tier client (plain REST). Used for signal analysis, topic scoring and the
// AI review pass. Never send client/CRM personal data through the free tier.
import "server-only";
import type { z } from "zod";
import { env, has } from "./env";

// Tried in order. Newer models are often overloaded (503) on the free tier, so a busy model
// falls through to the next one instead of failing the job.
export const GEMINI_MODELS = [
  ...new Set([env.geminiModel, "gemini-3.5-flash", "gemini-3.5-flash-lite"].filter(Boolean)),
];

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 120_000;

class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function callModel(model: string, prompt: string, temperature: number): Promise<string> {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env.geminiApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  if (!res.ok) throw new GeminiError(`${model}: ${res.status} ${body.error?.message ?? res.statusText}`, res.status);
  const text = body.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  if (!text) throw new GeminiError(`${model}: empty response`, 502);
  return text;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isBusy = (e: unknown) => e instanceof GeminiError && [429, 500, 502, 503, 504].includes(e.status);
const isTimeout = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

/** Ask Gemini for JSON and validate it, falling back across models and retrying when busy. */
export async function generateJson<S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts: { temperature?: number; rounds?: number; prefer?: string } = {},
): Promise<z.infer<S>> {
  if (!has(env.geminiApiKey)) throw new Error("GEMINI_API_KEY not set");
  const rounds = opts.rounds ?? 3;
  const errors: string[] = [];

  for (let round = 0; round < rounds; round++) {
    const models = opts.prefer ? [opts.prefer, ...GEMINI_MODELS.filter((m) => m !== opts.prefer)] : GEMINI_MODELS;
    for (const model of models) {
      try {
        const raw = await callModel(model, prompt, opts.temperature ?? 0.2);
        const parsed = schema.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;
        errors.push(`${model}: JSON did not match schema (${parsed.error.issues.slice(0, 2).map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")})`);
      } catch (err) {
        errors.push(String((err as Error).message ?? err));
        // Wrong key / bad request won't get better on another model.
        if (!isBusy(err) && !isTimeout(err) && !(err instanceof SyntaxError)) throw err;
      }
    }
    if (round < rounds - 1) await sleep(20_000 * (round + 1)); // all models busy: back off
  }
  throw new Error(`Gemini failed after ${rounds} rounds: ${errors.slice(-3).join(" | ")}`);
}
