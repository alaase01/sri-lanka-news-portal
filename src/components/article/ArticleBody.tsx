import type { ReactNode } from "react";

/**
 * Renders an article body stored as ProseMirror JSON.
 *
 * Security: this is an allow-list. Only the node and mark types handled below are
 * rendered; anything else is dropped. No HTML from the database is ever injected,
 * and link targets are limited to http(s), mailto and site-relative paths.
 */

type Mark = { type?: unknown; attrs?: Record<string, unknown> };
type Node = { type?: unknown; text?: unknown; attrs?: Record<string, unknown>; marks?: unknown; content?: unknown };

const MAX_DEPTH = 12;

function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return null;
}

function renderText(node: Node, key: number): ReactNode {
  if (typeof node.text !== "string") return null;
  let out: ReactNode = node.text;
  const marks = Array.isArray(node.marks) ? (node.marks as Mark[]) : [];
  for (const mark of marks) {
    if (mark.type === "bold") out = <strong>{out}</strong>;
    else if (mark.type === "italic") out = <em>{out}</em>;
    else if (mark.type === "link") {
      const href = safeHref(mark.attrs?.href);
      if (href) {
        const external = /^https?:/i.test(href);
        out = (
          <a href={href} rel={external ? "noopener noreferrer nofollow" : undefined}>
            {out}
          </a>
        );
      }
    }
  }
  return <span key={key}>{out}</span>;
}

function renderChildren(node: Node, depth: number): ReactNode[] {
  if (!Array.isArray(node.content) || depth > MAX_DEPTH) return [];
  return (node.content as Node[]).map((child, i) => renderNode(child, i, depth + 1));
}

function renderNode(node: Node, key: number, depth: number): ReactNode {
  if (!node || typeof node !== "object") return null;
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return <p key={key}>{renderChildren(node, depth)}</p>;
    case "heading": {
      const level = node.attrs?.level === 3 ? 3 : 2;
      return level === 3 ? <h3 key={key}>{renderChildren(node, depth)}</h3> : <h2 key={key}>{renderChildren(node, depth)}</h2>;
    }
    case "bulletList":
      return <ul key={key}>{renderChildren(node, depth)}</ul>;
    case "orderedList":
      return <ol key={key}>{renderChildren(node, depth)}</ol>;
    case "listItem":
      return <li key={key}>{renderChildren(node, depth)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node, depth)}</blockquote>;
    case "hardBreak":
      return <br key={key} />;
    default:
      return null;
  }
}

export function ArticleBody({ body }: { body: unknown }) {
  const doc = body as Node | null;
  if (!doc || typeof doc !== "object" || doc.type !== "doc") return null;
  return <div className="article-body">{renderChildren(doc, 0)}</div>;
}
