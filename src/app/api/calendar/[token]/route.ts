import { calendarItems } from "@/lib/calendar";
import { getSetting } from "@/lib/settings";
import { addDays, tokyoToday } from "@/lib/week";

// Private calendar feed (ICS) for Google Calendar / Outlook. Public URL, protected by a long random
// token shown only on the calendar page.
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const expected = await getSetting<string>("calendar_token");
  if (!expected || token !== expected) return new Response("Not found", { status: 404 });
  const today = tokyoToday();
  const { items } = await calendarItems(addDays(today, -14), addDays(today, 60));
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kizashi//Content calendar//EN", "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Kizashi content", "X-WR-TIMEZONE:Asia/Tokyo",
    ...items.filter((i) => i.state !== "unapproved").flatMap((i) => {
      const d = i.date.replace(/-/g, "");
      const next = addDays(i.date, 1).replace(/-/g, "");
      const what = i.kind === "hub" ? `[Hub] ${i.label}` : `[${i.label}]`;
      return [
        "BEGIN:VEVENT", `UID:${i.key}@kizashi`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
        `SUMMARY:${esc(`${what} ${i.title}`)}`,
        `DESCRIPTION:${esc(`${i.timing}${i.why ? ` — ${i.why}` : ""}\nStatus: ${i.state}\nhttps://signal-to-lead-os.vercel.app/topics/${i.topicId}`)}`,
        "END:VEVENT",
      ];
    }),
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
}
