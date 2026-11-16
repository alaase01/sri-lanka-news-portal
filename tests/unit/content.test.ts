import { describe, expect, it } from "vitest";
import { bodyText, cleanBody, safeHref, wordCount } from "@/lib/content/body";
import { isValidSlug, RESERVED_SLUGS, slugify } from "@/lib/content/slug";
import { mediaSrcSet, mediaUrl, MEDIA_FILE_PATTERN } from "@/lib/content/media";
import { fromColomboInput, toColomboInput } from "@/lib/utils/dates";

const p = (...content: object[]) => ({ type: "paragraph", content });
const text = (t: string, marks?: object[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });

describe("article body cleaning", () => {
  it("keeps every supported node and mark", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("ශීර්ෂය")] },
        { type: "heading", attrs: { level: 3 }, content: [text("Sub")] },
        p(text("bold", [{ type: "bold" }]), text(" "), text("italic", [{ type: "italic" }]), { type: "hardBreak" }, text("link", [{ type: "link", attrs: { href: "https://example.com" } }])),
        { type: "bulletList", content: [{ type: "listItem", content: [p(text("a"))] }] },
        { type: "orderedList", content: [{ type: "listItem", content: [p(text("b"))] }] },
        { type: "blockquote", content: [p(text("quote"))] },
      ],
    };
    expect(cleanBody(doc)).toEqual(doc);
  });

  it("drops unsupported nodes, marks and attributes", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "codeBlock", content: [text("rm -rf /")] },
        { type: "image", attrs: { src: "https://evil.example/x.png" } },
        { type: "heading", attrs: { level: 1, onclick: "x" }, content: [text("H")] },
        p(text("x", [{ type: "underline" }, { type: "bold" }, { type: "bold" }, { type: "textStyle", attrs: { color: "red" } }])),
        p({ type: "text", text: "<script>alert(1)</script>", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }),
      ],
    };
    expect(cleanBody(doc)).toEqual({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("H")] },
        p(text("x", [{ type: "bold" }])),
        // The text is kept as text (rendered escaped); the dangerous link is removed.
        p(text("<script>alert(1)</script>")),
      ],
    });
  });

  it("rejects things that are not documents and never returns an empty document", () => {
    expect(cleanBody(null)).toBeNull();
    expect(cleanBody("text")).toBeNull();
    expect(cleanBody({ type: "paragraph" })).toBeNull();
    expect(cleanBody({ type: "doc" })).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(cleanBody({ type: "doc", content: [text("loose text")] })).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("stops at a maximum nesting depth", () => {
    let node: object = p(text("deep"));
    for (let i = 0; i < 30; i++) node = { type: "blockquote", content: [node] };
    const json = JSON.stringify(cleanBody({ type: "doc", content: [node] }));
    expect(json).not.toContain("deep");
  });

  it("allows only safe link targets", () => {
    expect(safeHref("https://a.lk/x")).toBe("https://a.lk/x");
    expect(safeHref("mailto:news@a.lk")).toBe("mailto:news@a.lk");
    expect(safeHref("/si/politics")).toBe("/si/politics");
    for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.example", "vbscript:x", "ftp://x"]) {
      expect(safeHref(bad), bad).toBeNull();
    }
  });

  it("counts words in both languages", () => {
    const doc = cleanBody({ type: "doc", content: [p(text("ශ්‍රී ලංකා පුවත්")), p(text("two words"))] })!;
    expect(bodyText(doc)).toBe("ශ්‍රී ලංකා පුවත් two words");
    expect(wordCount(doc)).toBe(5);
    expect(wordCount(cleanBody({ type: "doc", content: [{ type: "paragraph" }] })!)).toBe(0);
  });
});

describe("slugs", () => {
  it("accepts lowercase Latin words with single hyphens", () => {
    for (const ok of ["a", "budget-2027", "new-train-timetable", "x".repeat(120)]) expect(isValidSlug(ok), ok).toBe(true);
    for (const bad of ["", "-a", "a-", "a--b", "A", "ශ්‍රී", "a b", "a/b", "a.b", "x".repeat(121), "a_b"]) expect(isValidSlug(bad), bad).toBe(false);
  });

  it("suggests slugs from English text and gives nothing for Sinhala", () => {
    expect(slugify("  Fuel Prices Cut by Rs. 15!  ")).toBe("fuel-prices-cut-by-rs-15");
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
    expect(slugify("ඉන්ධන මිල")).toBe("");
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(80);
  });

  it("reserves the site's own path words", () => {
    for (const w of ["page", "tag", "public-opinions", "developer", "admin", "media"]) expect(RESERVED_SLUGS.has(w)).toBe(true);
  });
});

describe("image URLs", () => {
  const key = "0123456789abcdef0123456789abcdef";
  it("builds URLs that the media route accepts", () => {
    expect(mediaUrl(key, 960)).toBe(`/media/${key}-960.webp`);
    expect(MEDIA_FILE_PATTERN.test(`${key}-960.webp`)).toBe(true);
    for (const bad of [`${key}-961.webp`, `../${key}-960.webp`, `${key}-960.png`, `${key.toUpperCase()}-960.webp`]) {
      expect(MEDIA_FILE_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it("describes real widths in srcset, without duplicates for small images", () => {
    expect(mediaSrcSet(key, 2000)).toBe(`/media/${key}-480.webp 480w, /media/${key}-960.webp 960w, /media/${key}-1600.webp 1600w`);
    expect(mediaSrcSet(key, 700)).toBe(`/media/${key}-480.webp 480w, /media/${key}-960.webp 700w`);
    expect(mediaSrcSet(key, 300)).toBe(`/media/${key}-480.webp 300w`);
  });
});

describe("Sri Lanka time inputs", () => {
  it("round-trips a datetime-local value at UTC+05:30", () => {
    const d = fromColomboInput("2026-12-01T09:30")!;
    expect(d.toISOString()).toBe("2026-12-01T04:00:00.000Z");
    expect(toColomboInput(d)).toBe("2026-12-01T09:30");
  });
  it("rejects malformed values", () => {
    for (const bad of ["", "2026-12-01", "2026-12-01 09:30", "2026-13-01T09:30", "2026-12-01T25:00", "x"]) expect(fromColomboInput(bad), bad).toBeNull();
  });
});
