// Payload CMS REST client. Articles are only ever created as drafts.
import "server-only";
import { env, has } from "./env";

export async function payloadFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!has(env.payloadUrl) || !has(env.payloadApiKey)) {
    throw new Error("PAYLOAD_URL / PAYLOAD_API_KEY not set");
  }
  const res = await fetch(`${env.payloadUrl}/api${path}`, {
    ...init,
    headers: {
      ...init.headers,
      // Payload API-key auth format: "<auth collection slug> API-Key <key>"
      Authorization: `${env.payloadAuthCollection} API-Key ${env.payloadApiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { errors?: { message?: string }[] }).errors?.[0]?.message ?? res.statusText;
    throw new Error(`${res.status}: ${msg}`);
  }
  return body as T;
}
