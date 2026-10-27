// Payload Lexical JSON → Markdown (enough to give a writer the current text of a live post).
type N = { type?: string; tag?: string; text?: string; format?: number; listType?: string; children?: N[]; fields?: { url?: string } };

function inline(nodes: N[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === "text") {
        let t = n.text ?? "";
        if ((n.format ?? 0) & 1) t = `**${t}**`;
        if ((n.format ?? 0) & 2) t = `*${t}*`;
        return t;
      }
      if (n.type === "link") return `[${inline(n.children)}](${n.fields?.url ?? ""})`;
      if (n.type === "linebreak") return "  \n";
      return inline(n.children);
    })
    .join("");
}

function block(n: N, depth = 0): string {
  switch (n.type) {
    case "heading":
      return `${"#".repeat(Number((n.tag ?? "h2").slice(1)) || 2)} ${inline(n.children)}`;
    case "paragraph":
      return inline(n.children);
    case "list":
      return (n.children ?? [])
        .map((li, i) => {
          const nested = (li.children ?? []).filter((c) => c.type === "list");
          const text = inline((li.children ?? []).filter((c) => c.type !== "list"));
          const marker = n.listType === "number" ? `${i + 1}.` : "-";
          return [`${"  ".repeat(depth)}${marker} ${text}`, ...nested.map((l) => block(l, depth + 1))].filter((x) => x.trim()).join("\n");
        })
        .join("\n");
    case "horizontalrule":
      return "---";
    default:
      return inline(n.children);
  }
}

export function lexicalToMarkdown(doc: { root?: N } | null | undefined): string {
  return (doc?.root?.children ?? []).map((n) => block(n)).filter((s) => s.trim()).join("\n\n");
}
