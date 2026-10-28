// Dashboard date ranges in Japan time. Presets + custom, with a same-length comparison period.
// GA4 / Search Console arrive a day or more late, so comparisons use only days that have data:
// "this week so far" is compared with the same number of days just before, never with a full week.
import { addDays, tokyoToday } from "./week";

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
  { key: "28d", label: "Last 28 days" },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"] | "custom";

export type Range = {
  key: PresetKey;
  label: string;
  start: string; // inclusive, YYYY-MM-DD (JST)
  end: string; // inclusive
};

export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const minDate = (a: string, b: string) => (a < b ? a : b);

function mondayOf(d: string): string {
  const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}

/** Resolve URL params to a range. `dataEnd` = last day GA4 has data (used by "Last 28 days"). */
export function resolveRange(p: { range?: string; from?: string; to?: string }, dataEnd: string): Range {
  const today = tokyoToday();
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (p.range) {
    case "today":
      return { key: "today", label: "Today", start: today, end: today };
    case "yesterday": {
      const d = addDays(today, -1);
      return { key: "yesterday", label: "Yesterday", start: d, end: d };
    }
    case "week":
      return { key: "week", label: "This week", start: mondayOf(today), end: today };
    case "month":
      return { key: "month", label: "This month", start: `${y}-${pad(m)}-01`, end: today };
    case "quarter":
      return { key: "quarter", label: "This quarter", start: `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`, end: today };
    case "year":
      return { key: "year", label: "This year", start: `${y}-01-01`, end: today };
    case "custom": {
      if (p.from && p.to && ISO.test(p.from) && ISO.test(p.to)) {
        const [a, b] = p.from <= p.to ? [p.from, p.to] : [p.to, p.from];
        const start = daysBetween(a, b) > 731 ? addDays(b, -731) : a; // cap at two years
        return { key: "custom", label: "Custom range", start, end: minDate(b, today) };
      }
      break;
    }
  }
  return { key: "28d", label: "Last 28 days", start: addDays(dataEnd, -27), end: dataEnd };
}

/** The part of a range that has data (ends at `dataEnd`), and the same-length period before it. */
export function withData(r: Range, dataEnd: string): { cur: { start: string; end: string } | null; prev: { start: string; end: string } | null; days: number } {
  const end = minDate(r.end, dataEnd);
  if (end < r.start) return { cur: null, prev: null, days: 0 };
  const days = daysBetween(r.start, end) + 1;
  return { cur: { start: r.start, end }, prev: { start: addDays(r.start, -days), end: addDays(r.start, -1) }, days };
}

/** Same-length period before the whole range (for data with no lag, like signals). */
export function previousOf(r: { start: string; end: string }): { start: string; end: string } {
  const days = daysBetween(r.start, r.end) + 1;
  return { start: addDays(r.start, -days), end: addDays(r.start, -1) };
}

export function fmtDay(d: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
}
