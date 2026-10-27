// Parse a pasted draft: YAML frontmatter + Markdown body.
import { parse as parseYaml } from "yaml";

export type Frontmatter = {
  title?: string;
  slug?: string;
  meta_title?: string;
  meta_description?: string;
  excerpt?: string;
};

export type ParsedDraft = { frontmatter: Frontmatter; body: string; errors: string[] };

export function parseDraft(raw: string): ParsedDraft {
  // Models often wrap the answer in a ``` fence; strip one outer fence.
  let text = raw.replace(/\r\n/g, "\n").trim();
  const fence = text.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence) text = fence[1].trim();

  const errors: string[] = [];
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    return { frontmatter: {}, body: text, errors: ["No frontmatter found. The draft must start with --- title/slug/… ---"] };
  }
  let fm: Frontmatter = {};
  try {
    const parsed = parseYaml(m[1]);
    if (parsed && typeof parsed === "object") fm = parsed as Frontmatter;
  } catch (err) {
    errors.push(`Frontmatter is not valid YAML: ${(err as Error).message.split("\n")[0]}`);
  }
  for (const k of Object.keys(fm) as (keyof Frontmatter)[]) {
    if (fm[k] != null) fm[k] = String(fm[k]).trim();
  }
  return { frontmatter: fm, body: m[2].trim(), errors };
}

/** Visible text length (what a Japanese reader counts as 文字数). */
export function charCount(markdown: string): number {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, "").length;
}
