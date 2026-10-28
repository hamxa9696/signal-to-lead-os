// Story strength 0–100 = relevance 35 + coverage 25 + momentum 15 + source weight 15 + evidence 10.
// Every part carries a plain-English note so the Signals page can explain the number.

export const STRENGTH_MAX = { relevance: 35, coverage: 25, momentum: 15, source: 15, evidence: 10 } as const;
export type StrengthParts = {
  relevance: number; coverage: number; momentum: number; source: number; evidence: number;
  notes: Record<keyof typeof STRENGTH_MAX, string>;
};

export type StorySignal = {
  relevance: number | null;
  outlet: string;
  tier: string; // source tier of the feed
  at: Date;
  deep: { full_text?: boolean } | null;
};

const TIER_POINTS: Record<string, [number, string]> = {
  official: [15, "an official source (government / regulator)"],
  major: [13, "a major national outlet"],
  trade: [9, "a specialist trade outlet"],
  community: [7, "a community source (what readers share)"],
  press_release: [6, "a company press release (self-published)"],
};

/** Tier of one article: the feed's tier, or for Google News items, guessed from the publisher. */
export function outletTier(feedTier: string, outlet: string): keyof typeof TIER_POINTS {
  if (feedTier !== "search") return (feedTier in TIER_POINTS ? feedTier : "trade") as keyof typeof TIER_POINTS;
  if (/(金融庁|経済産業省|総務省|デジタル庁|内閣府|政府|省$|庁$|IPA|日本銀行)/.test(outlet)) return "official";
  if (/(日本経済新聞|日経|共同通信|時事|NHK|朝日新聞|読売新聞|毎日新聞|産経|東洋経済|ダイヤモンド|ITmedia)/.test(outlet)) return "major";
  if (/(PR TIMES|プレスリリース|@Press|ValuePress|共同通信PRワイヤー)/i.test(outlet)) return "press_release";
  return "trade";
}

export function storyStrength(sigs: StorySignal[], now = Date.now()): { total: number; parts: StrengthParts } {
  const H = 3_600_000;
  const rel = Math.max(0, ...sigs.map((s) => Number(s.relevance ?? 0)));
  const relevance = Math.round(rel * STRENGTH_MAX.relevance);

  const outlets = new Set(sigs.map((s) => s.outlet)).size;
  const coverage = [0, 5, 12, 17, 21, 25][Math.min(outlets, 5)];

  const first = Math.min(...sigs.map((s) => s.at.getTime()));
  const a48 = sigs.filter((s) => now - s.at.getTime() <= 48 * H).length;
  const p48 = sigs.filter((s) => now - s.at.getTime() > 48 * H && now - s.at.getTime() <= 96 * H).length;
  let momentum: number;
  let mNote: string;
  if (now - first <= 48 * H) {
    momentum = a48 >= 3 ? 15 : a48 === 2 ? 12 : 7;
    mNote = `new in the last 48h with ${a48} article${a48 === 1 ? "" : "s"}`;
  } else if (a48 === 0) {
    momentum = 2;
    mNote = "no new articles in the last 48h (fading)";
  } else if (a48 > p48) {
    momentum = 13;
    mNote = `rising: ${a48} articles in the last 48h vs ${p48} before`;
  } else if (a48 === p48) {
    momentum = 8;
    mNote = `steady: ${a48} articles in each of the last two 48h windows`;
  } else {
    momentum = 5;
    mNote = `slowing: ${a48} articles in the last 48h vs ${p48} before`;
  }

  const tiers = sigs.map((s) => outletTier(s.tier, s.outlet));
  const best = tiers.sort((a, b) => TIER_POINTS[b][0] - TIER_POINTS[a][0])[0] ?? "trade";
  const [source, sNote] = TIER_POINTS[best];

  const full = sigs.some((s) => s.deep?.full_text);
  const deep = sigs.some((s) => s.deep);
  const evidence = full ? 10 : deep ? 6 : 3;

  const parts: StrengthParts = {
    relevance, coverage, momentum, source, evidence,
    notes: {
      relevance: `Gemini rated it ${rel.toFixed(2)} for your personas, industries and services.`,
      coverage: `${outlets} independent outlet${outlets === 1 ? "" : "s"} covered it.`,
      momentum: mNote[0].toUpperCase() + mNote.slice(1) + ".",
      source: `Strongest source is ${sNote}.`,
      evidence: full ? "At least one full article was read; facts come from it." : deep ? "Analysed from the summary only (paywall or unreadable link)." : "Headline and summary only so far.",
    },
  };
  return { total: relevance + coverage + momentum + source + evidence, parts };
}
