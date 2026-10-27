// Google service-account auth + thin REST helpers for GA4 Data API and Search Console.
import "server-only";
import { GoogleAuth } from "google-auth-library";
import { env, has } from "./env";

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

let auth: GoogleAuth | null = null;
function googleAuth(): GoogleAuth {
  if (!has(env.googleServiceAccountJson)) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  auth ??= new GoogleAuth({
    credentials: JSON.parse(env.googleServiceAccountJson),
    scopes: SCOPES,
  });
  return auth;
}

/** Authenticated JSON request to a Google API. Throws with the API's message on failure. */
export async function googleFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const client = await googleAuth().getClient();
  const { token } = await client.getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } }).error?.message ?? res.statusText;
    throw new Error(`${res.status}: ${msg}`);
  }
  return body as T;
}

export const ga4ReportUrl = (propertyId: string) =>
  `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

export const gscSiteUrl = (site: string) =>
  `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}`;
