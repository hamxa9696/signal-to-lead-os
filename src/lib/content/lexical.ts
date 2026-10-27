// Markdown → Payload Lexical JSON, matching the node shapes used by renesistech.jp posts
// (heading, paragraph, list/listitem, link v3, linebreak, horizontalrule; text format bitmask).
import { randomBytes } from "node:crypto";
import { Lexer, type Token, type Tokens } from "marked";

type LNode = Record<string, unknown>;

const FORMAT = { bold: 1, italic: 2, strike: 4, code: 16 } as const;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m] ?? m);

const textNode = (text: string, format = 0): LNode => ({
  detail: 0, format, mode: "normal", style: "", text: unescape(text), type: "text", version: 1,
});

const block = (type: string, children: LNode[], extra: LNode = {}): LNode => ({
  children, direction: null, format: "", indent: 0, type, version: 1, ...extra,
});

function inline(tokens: Token[] | undefined, format = 0): LNode[] {
  const out: LNode[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "strong":
        out.push(...inline((t as Tokens.Strong).tokens, format | FORMAT.bold));
        break;
      case "em":
        out.push(...inline((t as Tokens.Em).tokens, format | FORMAT.italic));
        break;
      case "del":
        out.push(...inline((t as Tokens.Del).tokens, format | FORMAT.strike));
        break;
      case "codespan":
        out.push(textNode((t as Tokens.Codespan).text, format | FORMAT.code));
        break;
      case "br":
        out.push({ type: "linebreak", version: 1 });
        break;
      case "link": {
        const l = t as Tokens.Link;
        const external = !/renesistech\.jp/.test(l.href) && /^https?:/.test(l.href);
        out.push({
          ...block("link", inline(l.tokens, format)),
          version: 3,
          fields: { linkType: "custom", newTab: external, url: l.href },
          id: randomBytes(12).toString("hex"),
        });
        break;
      }
      case "image":
        break; // images are added in the CMS
      case "text":
      case "escape":
      case "html": {
        const tt = t as Tokens.Text;
        if (tt.tokens?.length) out.push(...inline(tt.tokens, format));
        else if (tt.text) out.push(textNode(tt.text, format));
        break;
      }
      default:
        if ("text" in t && typeof t.text === "string") out.push(textNode(t.text, format));
    }
  }
  return out;
}

const paragraph = (children: LNode[]) => block("paragraph", children, { textFormat: 0, textStyle: "" });

function list(l: Tokens.List): LNode {
  const start = typeof l.start === "number" ? l.start : 1;
  return block(
    "list",
    l.items.map((item, i) => {
      const children: LNode[] = [];
      for (const t of item.tokens) {
        if (t.type === "list") children.push(list(t as Tokens.List)); // nested list
        else if (t.type === "text" || t.type === "paragraph") children.push(...inline((t as Tokens.Text).tokens ?? [t]));
      }
      return block("listitem", children, { value: start + i });
    }),
    { listType: l.ordered ? "number" : "bullet", start, tag: l.ordered ? "ol" : "ul" },
  );
}

function blocks(tokens: Token[]): LNode[] {
  const out: LNode[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "heading": {
        const h = t as Tokens.Heading;
        out.push(block("heading", inline(h.tokens), { tag: `h${Math.min(Math.max(h.depth, 1), 6)}` }));
        break;
      }
      case "paragraph":
        out.push(paragraph(inline((t as Tokens.Paragraph).tokens)));
        break;
      case "list":
        out.push(list(t as Tokens.List));
        break;
      case "blockquote":
        // The site's editor has no quote node in use; keep the text as paragraphs.
        out.push(...blocks((t as Tokens.Blockquote).tokens));
        break;
      case "hr":
        out.push({ type: "horizontalrule", version: 1 });
        break;
      case "table": {
        // Not supported by the site editor: one paragraph per row, cells joined.
        const tb = t as Tokens.Table;
        for (const row of [tb.header, ...tb.rows]) out.push(paragraph([textNode(row.map((c) => c.text).join("｜"))]));
        break;
      }
      case "code":
        out.push(paragraph([textNode((t as Tokens.Code).text, FORMAT.code)]));
        break;
      case "space":
      case "html":
        break;
      default:
        if ("text" in t && typeof t.text === "string" && t.text.trim()) out.push(paragraph([textNode(t.text)]));
    }
  }
  return out;
}

/** Full Lexical document. Existing posts start with the title as an H1, so we do the same. */
export function markdownToLexical(markdown: string, title?: string): { root: LNode } {
  const children = blocks(new Lexer().lex(markdown));
  if (title) children.unshift(block("heading", [textNode(title)], { tag: "h1" }));
  return { root: { children, direction: null, format: "", indent: 0, type: "root", version: 1 } };
}
