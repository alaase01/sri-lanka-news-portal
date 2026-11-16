/**
 * Article bodies are ProseMirror JSON. This module is the single definition of
 * what a body may contain. The editor produces it, the server cleans every
 * submitted body with `cleanBody` before saving, and the public renderer
 * (components/article/ArticleBody.tsx) renders the same node types.
 *
 * Anything outside the allow-list is dropped rather than rejected, so pasting
 * from a web page or Word never fails; it just loses unsupported formatting.
 */

export type BodyMark = { type: "bold" | "italic" } | { type: "link"; attrs: { href: string } };
export type BodyNode = {
  type: string;
  text?: string;
  attrs?: { level?: 2 | 3; href?: string };
  marks?: BodyMark[];
  content?: BodyNode[];
};
export type BodyDoc = { type: "doc"; content: BodyNode[] };

export const MAX_BODY_CHARS = 100_000;
const MAX_DEPTH = 10;

const BLOCKS = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote"]);

export function emptyBody(): BodyDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Accepts http(s), mailto and site-relative links only. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (href.length > 2000) return null;
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return null;
}

function cleanMarks(marks: unknown): BodyMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: BodyMark[] = [];
  for (const m of marks) {
    const type = (m as { type?: unknown })?.type;
    if ((type === "bold" || type === "italic") && !out.some((o) => o.type === type)) out.push({ type });
    else if (type === "link" && !out.some((o) => o.type === "link")) {
      const href = safeHref((m as { attrs?: { href?: unknown } }).attrs?.href);
      if (href) out.push({ type: "link", attrs: { href } });
    }
  }
  return out.length ? out : undefined;
}

function cleanNode(node: unknown, depth: number): BodyNode | null {
  if (!node || typeof node !== "object" || depth > MAX_DEPTH) return null;
  const n = node as { type?: unknown; text?: unknown; attrs?: { level?: unknown }; marks?: unknown; content?: unknown };
  if (n.type === "text") {
    if (typeof n.text !== "string" || n.text.length === 0) return null;
    const marks = cleanMarks(n.marks);
    return marks ? { type: "text", text: n.text, marks } : { type: "text", text: n.text };
  }
  if (n.type === "hardBreak") return { type: "hardBreak" };
  if (typeof n.type !== "string" || !BLOCKS.has(n.type)) {
    // Unknown wrapper (e.g. a table or code block from a paste): keep its text as paragraphs.
    return null;
  }
  const content = Array.isArray(n.content)
    ? n.content.map((c) => cleanNode(c, depth + 1)).filter((c): c is BodyNode => c !== null)
    : [];
  const out: BodyNode = { type: n.type };
  if (n.type === "heading") out.attrs = { level: n.attrs?.level === 3 ? 3 : 2 };
  if (content.length) out.content = content;
  return out;
}

/** Returns a clean body, or null when the input is not a ProseMirror document at all. */
export function cleanBody(input: unknown): BodyDoc | null {
  if (!input || typeof input !== "object" || (input as { type?: unknown }).type !== "doc") return null;
  const raw = (input as { content?: unknown }).content;
  const content = Array.isArray(raw)
    ? raw.map((c) => cleanNode(c, 1)).filter((c): c is BodyNode => c !== null && c.type !== "text" && c.type !== "hardBreak")
    : [];
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** Plain text of a body, for word counts and checks. */
export function bodyText(doc: BodyDoc | BodyNode): string {
  if ("text" in doc && typeof doc.text === "string") return doc.text;
  return (doc.content ?? []).map((c) => bodyText(c)).join(" ").replace(/\s+/g, " ").trim();
}

export function wordCount(doc: BodyDoc): number {
  const text = bodyText(doc);
  return text ? text.split(" ").length : 0;
}
