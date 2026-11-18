"use client";

import { useEditor, EditorContent, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { useState } from "react";
import type { BodyDoc } from "@/lib/content/body";
import { safeHref } from "@/lib/content/body";

/**
 * Article text editor. It offers only what the public site renders (see
 * lib/content/body.ts): paragraphs, two heading levels, bold, italic, links,
 * lists and quotes. Pasted content keeps only those; the server cleans it again.
 */

type Props = {
  initial: BodyDoc;
  locale: "si" | "en";
  onChange: (doc: BodyDoc) => void;
  invalid?: boolean;
  describedBy?: string;
  /** Offer left / centre / right / justified alignment (static pages only). */
  allowAlign?: boolean;
  label?: string;
};

export function RichTextEditor({ initial, locale, onChange, invalid, describedBy, allowAlign = false, label = "Article text" }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          protocols: ["http", "https", "mailto"],
          defaultProtocol: "https",
          isAllowedUri: (url) => safeHref(url) !== null,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
        },
      }),
      ...(allowAlign ? [TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] })] : []),
    ],
    content: initial,
    editorProps: {
      attributes: {
        class: "article-body min-h-[360px] px-4 py-3 outline-none",
        lang: locale,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(invalid ? { "aria-invalid": "true" } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as BodyDoc),
  });

  return (
    <div className={"rounded border bg-white " + (invalid ? "border-brand-dark" : "border-muted")}>
      {editor ? <Toolbar editor={editor} allowAlign={allowAlign} /> : <div className="h-11 border-b border-line" />}
      <div className={locale === "si" ? "font-sans" : ""}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor, allowAlign }: { editor: Editor; allowAlign: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      align: allowAlign ? ((["center", "right", "justify"] as const).find((a) => e.isActive({ textAlign: a })) ?? "left") : "left",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [linkError, setLinkError] = useState("");

  const btn = (active: boolean) =>
    "min-h-9 min-w-9 rounded px-2 text-sm font-semibold " + (active ? "bg-navy text-white" : "text-ink hover:bg-soft");

  function applyLink() {
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    // "example.com" gets https:// added; any other scheme (javascript:, data:, ftp:) is refused.
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(value);
    const withProtocol = /^(https?:\/\/|mailto:|\/)/i.test(value) || hasScheme ? value : `https://${value}`;
    if (!safeHref(withProtocol)) {
      setLinkError("Use a web address starting with https://, an email (mailto:) or a page on this site (/si/...).");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: withProtocol }).run();
    setLinkOpen(false);
  }

  return (
    <div className="sticky top-0 z-10 border-b border-line bg-white">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 p-1">
        <button type="button" className={btn(s.h2)} aria-pressed={s.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">H2</button>
        <button type="button" className={btn(s.h3)} aria-pressed={s.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Subheading">H3</button>
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
        <button type="button" className={btn(s.bold) + " font-bold"} aria-pressed={s.bold} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">B</button>
        <button type="button" className={btn(s.italic) + " italic"} aria-pressed={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">I</button>
        <button
          type="button"
          className={btn(s.link)}
          aria-pressed={s.link}
          aria-expanded={linkOpen}
          onClick={() => {
            setHref(s.href);
            setLinkError("");
            setLinkOpen((o) => !o);
          }}
          title="Link"
        >
          Link
        </button>
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
        <button type="button" className={btn(s.bullet)} aria-pressed={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list">• List</button>
        <button type="button" className={btn(s.ordered)} aria-pressed={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">1. List</button>
        <button type="button" className={btn(s.quote)} aria-pressed={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">Quote</button>
        {allowAlign && (
          <>
            <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
            {(
              [
                ["left", "Align left", "⇤"],
                ["center", "Centre", "↔"],
                ["right", "Align right", "⇥"],
                ["justify", "Justify", "☰"],
              ] as const
            ).map(([a, name, icon]) => (
              <button key={a} type="button" className={btn(s.align === a)} aria-pressed={s.align === a} aria-label={name} title={name} onClick={() => editor.chain().focus().setTextAlign(a).run()}>
                {icon}
              </button>
            ))}
          </>
        )}
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
        <button type="button" className={btn(false)} disabled={!s.canUndo} onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" className={btn(false)} disabled={!s.canRedo} onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)">Redo</button>
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-2">
          <label htmlFor="link-href" className="text-sm font-semibold">Link to</label>
          <input
            id="link-href"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded border border-muted px-2 py-1"
            autoFocus
          />
          <button type="button" className="min-h-9 rounded bg-navy px-3 text-sm font-bold text-white" onClick={applyLink}>Apply</button>
          {s.link && (
            <button type="button" className="min-h-9 rounded px-3 text-sm font-semibold text-brand-dark hover:bg-soft" onClick={() => { setHref(""); editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); }}>
              Remove link
            </button>
          )}
          {linkError && <p role="alert" className="w-full text-sm text-brand-dark">{linkError}</p>}
        </div>
      )}
    </div>
  );
}
