// Serves a locally built lead-magnet PDF for preview (local admin app only).
import { readFileSync } from "node:fs";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [f] = await sql<{ local_path: string }[]>`select local_path from magnet_files where slug = ${slug.replace(/\.pdf$/, "")}`;
  if (!f) return new Response("not found", { status: 404 });
  try {
    return new Response(readFileSync(f.local_path), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${slug.replace(/\.pdf$/, "")}.pdf"` },
    });
  } catch {
    return new Response("file missing: rebuild the PDF", { status: 404 });
  }
}
