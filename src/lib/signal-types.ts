// What kind of news a signal is. Each type suggests a different article angle.
export const SIGNAL_TYPES = [
  { key: "regulation", label: "Regulation", color: "#B42318", angle: "What companies must do, by when" },
  { key: "funding", label: "Funding / investment", color: "#0B7A52", angle: "Where the money is going and why" },
  { key: "launch", label: "Product launch", color: "#4F46E5", angle: "What it means for buyers; how to evaluate it" },
  { key: "case_study", label: "Case study", color: "#0E9F6E", angle: "How a company did it, with numbers" },
  { key: "survey", label: "Survey / statistics", color: "#2E6BE6", angle: "What the data says for your reader" },
  { key: "partnership", label: "Partnership", color: "#7C4DDB", angle: "Who is teaming up and what it signals" },
  { key: "incident", label: "Incident / risk", color: "#D97706", angle: "The risk and how to avoid it" },
  { key: "opinion", label: "Opinion / trend", color: "#667085", angle: "The trend and a practical take" },
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number]["key"];
export const TYPE_KEYS = SIGNAL_TYPES.map((t) => t.key) as unknown as [SignalType, ...SignalType[]];
export const typeInfo = (k: string | null | undefined) => SIGNAL_TYPES.find((t) => t.key === k) ?? null;

export const TYPE_PROMPT = [
  "signal_type: one of " + SIGNAL_TYPES.map((t) => t.key).join(", ") + ":",
  "  regulation = laws, guidelines, government rules; funding = investment, fundraising, budgets;",
  "  launch = new product/service/feature; case_study = a company's adoption with results;",
  "  survey = research, statistics, polls; partnership = alliances, joint ventures, M&A;",
  "  incident = breaches, failures, outages, fraud; opinion = commentary, trends, explainers.",
].join("\n");
