// "Citability": how easy a draft is for ChatGPT, Gemini, Copilot and Perplexity to lift and quote.
// Deterministic, based on what the most-cited B2B articles share (LinkedIn / Meltwater 2026):
// lists 100%, H2/H3 92%, named tools 75%, hard numbers 67%, evaluation framework 50%, "how to
// choose" 33%, year in title 25%, plus 30–80-word answer blocks under each heading.

export type CitePart = { id: string; label: string; points: number; max: number; detail: string; tip: string };
export type Citability = { score: number; parts: CitePart[] };

const QUESTION_H = /[？?]\s*$|とは|方法|やり方|選び方|費用|料金|相場|違い|比較|なぜ|どう|いくら|ポイント|注意点|メリット|デメリット|手順|ステップ/;

/** Split Markdown into H2 sections: heading + text until the next H2. */
function sections(md: string): { h: string; text: string }[] {
  const out: { h: string; text: string }[] = [];
  let cur: { h: string; text: string } | null = null;
  for (const line of md.split("\n")) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) { if (cur) out.push(cur); cur = { h: m[1].trim(), text: "" }; }
    else if (cur) cur.text += line + "\n";
  }
  if (cur) out.push(cur);
  return out;
}

const firstParagraph = (text: string) =>
  text.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^(#{3,}|[-*]\s|\d+\.\s)/.test(p)) ?? "";

export function citability(md: string, title = ""): Citability {
  const body = md.replace(/\r/g, "");
  const secs = sections(body).filter((s) => !/まとめ|よくある質問|FAQ/i.test(s.h));
  const parts: CitePart[] = [];
  const add = (id: string, label: string, max: number, ratio: number, detail: string, tip: string) =>
    parts.push({ id, label, max, points: Math.round(max * Math.max(0, Math.min(1, ratio))), detail, tip });

  // Lists: every top-cited article uses them.
  const lists = body.split(/\n\s*\n/).filter((b) => /^\s*(?:[-*]|\d+\.)\s+/m.test(b)).length;
  add("lists", "Bullet / numbered lists", 15, lists / 3, `${lists} list${lists === 1 ? "" : "s"}`, "Use lists in at least 3 sections.");

  // Clear heading hierarchy.
  const h2 = (body.match(/^##\s+/gm) ?? []).length;
  const h3 = (body.match(/^###\s+/gm) ?? []).length;
  add("headings", "Clear H2/H3 structure", 15, Math.min(h2, 6) / 5 * (h3 > 0 ? 1 : 0.8), `${h2} H2, ${h3} H3`, "5+ H2 sections, with ### where a section has parts.");

  // Answer blocks: the first paragraph under each H2 answers it in 60–150 characters (≈ 30–80 English words).
  const answered = secs.filter((s) => { const n = [...firstParagraph(s.text)].length; return n >= 40 && n <= 200; }).length;
  add("answers", "Answer block under each heading", 15, secs.length ? answered / secs.length / 0.8 : 0,
    `${answered}/${secs.length} sections`, "Open every H2 with a 60–150 character direct answer, then explain.");

  // Opening 結論.
  const intro = firstParagraph(body.split(/^##\s/m)[0] ?? "") || firstParagraph(body);
  const introLen = [...intro].length;
  add("conclusion", "Opens with a quotable 結論", 10, /結論|要点|まとめると/.test(intro) && introLen <= 260 ? 1 : introLen > 0 && introLen <= 200 ? 0.6 : 0.2,
    `${introLen} chars`, "Start with **結論：** and the answer in 2–3 sentences.");

  // Question-style headings.
  const q = secs.filter((s) => QUESTION_H.test(s.h)).length;
  add("questions", "Headings phrased as buyer questions", 10, secs.length ? q / secs.length / 0.5 : 0, `${q}/${secs.length}`, "Phrase H2s as questions: 〜とは？ / 費用は？ / 選び方は？");

  // Named entities: Latin brand/standard names, organisations (庁/省/協会/株式会社/社), katakana product names in 「」.
  const latin = new Set((body.match(/\b[A-Z][A-Za-z0-9.\-]{1,}(?:\s[A-Z][A-Za-z0-9.\-]+)*\b/g) ?? []).filter((w) => !/^(AI|DX|IT|Q|A|FAQ|CTA)$/.test(w)));
  const orgs = new Set(body.match(/[一-龥ァ-ヴー]{1,12}(?:庁|省|協会|機構|株式会社|銀行|証券|取引所)/g) ?? []);
  const named = latin.size + orgs.size;
  add("entities", "Names specific tools / companies / bodies", 10, named / 6, `${named} named`, "Name real tools, standards, agencies and companies.");

  // Hard numbers, ideally sourced.
  const numbers = (body.match(/\d[\d,.]*\s*(?:%|％|円|万|億|兆|年|か月|ヶ月|カ月|日|週間|社|件|倍|人|時間)/g) ?? []).length;
  const sourced = (body.match(/出典|調査|によると|発表|公表|レポート|白書/g) ?? []).length;
  add("numbers", "Hard numbers with sources", 10, Math.min(numbers / 5, 1) * (sourced > 0 ? 1 : 0.6), `${numbers} numbers, ${sourced} source mentions`, "Add costs, timelines and percentages, each with its source.");

  // Evaluation framework / how-to-choose.
  const framework = /比較|選び方|判断基準|評価基準|チェックリスト|メリット.{0,10}デメリット|向いている/.test(body);
  add("framework", "Comparison or how-to-choose framework", 10, framework ? 1 : 0, framework ? "yes" : "none", "Add judging criteria or a 選び方 section as a numbered list.");

  // Closing summary / checklist.
  const matome = sections(body).find((s) => /まとめ/.test(s.h));
  add("summary", "Closes with a summary checklist", 5, matome ? (/^\s*(?:[-*]|\d+\.)\s+/m.test(matome.text) ? 1 : 0.5) : 0,
    matome ? (/^\s*(?:[-*]|\d+\.)\s+/m.test(matome.text) ? "list" : "prose") : "missing", "End ## まとめ with 3–5 next-step bullets.");

  // Freshness: year in the title (helps time-sensitive topics; minor otherwise).
  const year = new Date().getFullYear();
  const fresh = new RegExp(`${year}|${year + 1}`).test(title) ? 1 : new RegExp(`${year}`).test(body) ? 0.5 : 0;
  add("fresh", "Signals freshness (year)", 5, fresh, fresh === 1 ? "year in title" : fresh ? "year in body" : "no year", `Mention ${year}年 where the topic is time-sensitive.`);

  const score = Math.round(parts.reduce((a, p) => a + p.points, 0) / parts.reduce((a, p) => a + p.max, 0) * 100);
  return { score, parts };
}
