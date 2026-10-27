// Gemini free-tier client. Used for signal analysis, topic scoring and the AI review pass.
// Never send client/CRM personal data through the free tier.
import "server-only";
import { GoogleGenAI } from "@google/genai";
import { env, has } from "./env";

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!has(env.geminiApiKey)) throw new Error("GEMINI_API_KEY not set");
  client ??= new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

export const GEMINI_MODEL = env.geminiModel;
