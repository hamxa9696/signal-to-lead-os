import { generateMonthlyReview } from "@/lib/monthly";
import type { Job } from "./types";

export const monthlyReview: Job = {
  name: "monthly-review",
  description: "Refresh / expand / prune recommendations for this month",
  async run() {
    const r = await generateMonthlyReview();
    return { status: "ok", stats: r };
  },
};
