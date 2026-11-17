import { cleanBody, type BodyDoc, type BodyMark, type BodyNode } from "./body";

/**
 * Converts article bodies (ProseMirror JSON) to a small Markdown subset and back,
 * so the AI assistant can read and return formatted text.
 *
 * Supported: paragraphs, ## and ### headings, bullet and numbered lists,
 * > quotes, **bold**, *italic*, [links](https://…) and line breaks inside a
 * paragraph. Anything else becomes plain text. The result of markdownToBody is
 * always passed through cleanBody, so it can only contain allowed node types and
 * safe links, whatever the input.
 */

// ───────────────────────── body → markdown ─────────────────────────

function escapeText(text: string): string {
  return text.replace(/([\\*[\]])/g, "\\$1");
}

function inlineToMarkdown(nodes: BodyNode[] | undefined): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out += "\n";
      continue;
    }
    if (n.type !== "text" || typeof n.text !== "string") {
      out += inlineToMarkdown(n.content);
      continue;
    }
    // Keep surrounding spaces outside the markers so "**word** " stays valid.
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.text) ?? ["", "", n.text, ""];
    let t = escapeText(core);
    if (t) {
      const marks = n.marks ?? [];
      if (marks.some((m) => m.type === "italic")) t = `*${t}*`;
      if (marks.some((m) => m.type === "bold")) t = `**${t}**`;
      const link = marks.find((m): m is Extract<BodyMark, { type: "link" }> => m.type === "link");
      if (link) t = `[${t}](${link.attrs.href.replace(/[()\s]/g, encodeURIComponent)})`;
    }
    out += lead + t + trail;
  }
  return out;
}

function blockToMarkdown(node: BodyNode): string {
  switch (node.type) {
    case "heading":
      return `${node.attrs?.level === 3 ? "###" : "##"} ${inlineToMarkdown(node.content).replace(/\n/g, " ")}`;
    case "bulletList":
    case "orderedList":
      return (node.content ?? [])
        .map((item, i) => {
          const text = (item.content ?? []).map((c) => (c.type === "paragraph" ? inlineToMarkdown(c.content) : blockToMarkdown(c))).join(" ");
          return `${node.type === "orderedList" ? `${i + 1}.` : "-"} ${text.replace(/\n+/g, " ")}`;
        })
        .join("\n");
    case "blockquote":
      return (node.content ?? [])
        .map((c) => blockToMarkdown(c).split("\n").map((l) => `> ${l}`).join("\n"))
        .join("\n>\n");
    case "paragraph":
      return inlineToMarkdown(node.content);
    default:
      return inlineToMarkdown(node.content);
  }
}

export function bodyToMarkdown(doc: BodyDoc): string {
  return doc.content
    .map(blockToMarkdown)
    .filter((b) => b.trim() !== "")
    .join("\n\n");
}

// ───────────────────────── markdown → body ─────────────────────────

type Mark = BodyMark;

function textNode(text: string, marks: Mark[]): BodyNode {
  return marks.length ? { type: "text", text, marks: marks.map((m) => ({ ...m })) } : { type: "text", text };
}

/** Index of the closing marker, skipping escaped characters; -1 when absent. */
function findClosing(s: string, from: number, marker: string): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s.startsWith(marker, i)) {
      // A single * must not match the first star of **.
      if (marker === "*" && s[i + 1] === "*") {
        i++;
        continue;
      }
      return i;
    }
  }
  return -1;
}

function parseInline(s: string, marks: Mark[] = []): BodyNode[] {
  const out: BodyNode[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(textNode(buf, marks));
    buf = "";
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      buf += s[++i];
      continue;
    }
    if (c === "\n") {
      flush();
      out.push({ type: "hardBreak" });
      continue;
    }
    if (s.startsWith("**", i)) {
      const end = findClosing(s, i + 2, "**");
      if (end > i + 2 && !marks.some((m) => m.type === "bold")) {
        flush();
        out.push(...parseInline(s.slice(i + 2, end), [...marks, { type: "bold" }]));
        i = end + 1;
        continue;
      }
    } else if (c === "*") {
      const end = findClosing(s, i + 1, "*");
      if (end > i + 1 && !marks.some((m) => m.type === "italic")) {
        flush();
        out.push(...parseInline(s.slice(i + 1, end), [...marks, { type: "italic" }]));
        i = end;
        continue;
      }
    } else if (c === "[") {
      const close = findClosing(s, i + 1, "]");
      if (close > i + 1 && s[close + 1] === "(") {
        const paren = s.indexOf(")", close + 2);
        if (paren > close + 2) {
          let href = s.slice(close + 2, paren).trim();
          try {
            href = decodeURI(href);
          } catch {
            /* keep as written */
          }
          flush();
          const inner = marks.filter((m) => m.type !== "link");
          out.push(...parseInline(s.slice(i + 1, close), [...inner, { type: "link", attrs: { href } }]));
          i = paren;
          continue;
        }
      }
    }
    buf += c;
  }
  flush();
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s*(#{1,6})\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function markdownToBody(markdown: string): BodyDoc {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BodyNode[] = [];
  let para: string[] = [];
  let list: { type: "bulletList" | "orderedList"; items: string[] } | null = null;
  let quote: string[] | null = null;

  const endPara = () => {
    if (para.length) blocks.push({ type: "paragraph", content: parseInline(para.join("\n").trim()) });
    para = [];
  };
  const endList = () => {
    if (list) {
      blocks.push({
        type: list.type,
        content: list.items.map((t) => ({ type: "listItem", content: [{ type: "paragraph", content: parseInline(t.trim()) }] })),
      });
    }
    list = null;
  };
  const endQuote = () => {
    if (quote) {
      const inner = markdownToBody(quote.join("\n")).content;
      blocks.push({ type: "blockquote", content: inner });
    }
    quote = null;
  };
  const endAll = () => {
    endPara();
    endList();
    endQuote();
  };

  for (const line of lines) {
    if (line.trim() === "") {
      endAll();
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      endPara();
      endList();
      (quote ??= []).push(q[1]);
      continue;
    }
    if (quote) endQuote();

    const h = HEADING.exec(line);
    if (h) {
      endAll();
      blocks.push({ type: "heading", attrs: { level: h[1].length >= 3 ? 3 : 2 }, content: parseInline(h[2].trim()) });
      continue;
    }
    const b = BULLET.exec(line);
    const o = b ? null : NUMBERED.exec(line);
    if (b || o) {
      endPara();
      const type = b ? "bulletList" : "orderedList";
      if (list && list.type !== type) endList();
      (list ??= { type, items: [] }).items.push((b ?? o)![1]);
      continue;
    }
    if (list) {
      // A wrapped line continues the last item.
      const items: string[] = (list as { items: string[] }).items;
      items[items.length - 1] += " " + line.trim();
      continue;
    }
    para.push(line.trim());
  }
  endAll();
  return cleanBody({ type: "doc", content: blocks }) ?? { type: "doc", content: [{ type: "paragraph" }] };
}

/** Pasted plain text: blank lines separate paragraphs, single line breaks are kept. No formatting is interpreted. */
export function plainTextToBody(text: string): BodyDoc {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const content: BodyNode[] = paragraphs.map((p) => {
    const parts = p.split("\n");
    const inline: BodyNode[] = [];
    parts.forEach((part, i) => {
      if (i > 0) inline.push({ type: "hardBreak" });
      if (part.trim()) inline.push({ type: "text", text: part.trim() });
    });
    return { type: "paragraph", content: inline };
  });
  return cleanBody({ type: "doc", content }) ?? { type: "doc", content: [{ type: "paragraph" }] };
}

/** Plain text with paragraph breaks, for copying to the clipboard. */
export function bodyToPlainText(doc: BodyDoc): string {
  const inline = (nodes: BodyNode[] | undefined): string =>
    (nodes ?? []).map((n) => (n.type === "hardBreak" ? "\n" : typeof n.text === "string" ? n.text : inline(n.content))).join("");
  const block = (n: BodyNode): string => {
    if (n.type === "bulletList" || n.type === "orderedList")
      return (n.content ?? []).map((item, i) => `${n.type === "orderedList" ? `${i + 1}.` : "•"} ${(item.content ?? []).map(block).join(" ")}`).join("\n");
    if (n.type === "blockquote") return (n.content ?? []).map(block).join("\n");
    return inline(n.content);
  };
  return doc.content.map(block).filter((b) => b.trim()).join("\n\n");
}

/** All link targets in a body. */
export function bodyLinks(doc: BodyDoc): Set<string> {
  const out = new Set<string>();
  const walk = (n: BodyNode) => {
    for (const m of n.marks ?? []) if (m.type === "link") out.add(m.attrs.href);
    (n.content ?? []).forEach(walk);
  };
  doc.content.forEach(walk);
  return out;
}

/**
 * Removes links whose target is not in `allowed`, keeping their text.
 * The assistant may keep links from the original but must not add new ones.
 */
export function keepOnlyLinks(doc: BodyDoc, allowed: Set<string>): { doc: BodyDoc; removed: number } {
  let removed = 0;
  const walk = (n: BodyNode): BodyNode => {
    const out: BodyNode = { ...n };
    if (n.marks) {
      out.marks = n.marks.filter((m) => {
        if (m.type !== "link" || allowed.has(m.attrs.href)) return true;
        removed++;
        return false;
      });
      if (!out.marks.length) delete out.marks;
    }
    if (n.content) out.content = n.content.map(walk);
    return out;
  };
  return { doc: { type: "doc", content: doc.content.map(walk) }, removed };
}
