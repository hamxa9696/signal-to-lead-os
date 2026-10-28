// When things happen: the hub's planned day in the week, and each spoke's day relative to the hub.
import { addDays } from "./week";
import type { Slot } from "./formats";

/** Hub day in the planning week (Mon = week_of): fast take Tue, evergreen Wed–Fri, lead magnet Thu, rewrites Fri. */
export function plannedHubDate(weekOf: string, slot: Slot, nth = 0): string {
  const offset = slot === "fast_take" ? 1 : slot === "lead_magnet" ? 3 : slot === "refresh" ? 4 : 2 + (nth % 3);
  return addDays(weekOf, offset);
}

/** Days after the hub goes live, read from the planner's timing text ("same day", "within 24h", "day 3", "Friday newsletter"…). */
export function spokeOffsetDays(timing: string, hubDate: string): number {
  const t = timing.toLowerCase();
  const day = /day\s*(\d+)/.exec(t);
  if (day) return Math.max(0, Number(day[1]) - 1);
  if (/same day|immediately|当日/.test(t)) return 0;
  if (/24\s*h|next day|翌日/.test(t)) return 1;
  if (/48\s*h/.test(t)) return 2;
  if (/2 weeks|two weeks/.test(t)) return 10;
  if (/week/.test(t)) return 5;
  if (/friday|newsletter/.test(t)) {
    const dow = new Date(`${hubDate}T00:00:00Z`).getUTCDay(); // 0 Sun … 5 Fri
    return ((5 - dow + 7) % 7) || 7;
  }
  return 1;
}

export const spokeDate = (hubDate: string, timing: string) => addDays(hubDate, spokeOffsetDays(timing, hubDate));
