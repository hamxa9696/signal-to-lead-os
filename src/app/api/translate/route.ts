import { NextResponse, type NextRequest } from "next/server";
import { translateMany } from "@/lib/translate";

// Behind login (proxy.ts). Body: { texts: string[] } → { map: { [japanese]: english } }.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { texts?: unknown } | null;
  const texts = Array.isArray(body?.texts) ? body.texts.filter((t): t is string => typeof t === "string").slice(0, 400) : [];
  try {
    return NextResponse.json({ map: await translateMany(texts) });
  } catch (err) {
    return NextResponse.json({ map: {}, error: (err as Error).message.slice(0, 200) }, { status: 502 });
  }
}
