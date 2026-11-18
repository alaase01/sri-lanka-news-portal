import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STARTER_PAGES } from "../../prisma/static-pages/content";
import { markdownToBody } from "@/lib/content/markdown";
import { bodyText, cleanBody } from "@/lib/content/body";
import { RESERVED_SLUGS } from "@/lib/content/slug";
import { findPlaceholders } from "@/server/admin/pages";
import { STATIC_PAGE_SLUGS } from "@/server/services/pages";

const MIGRATION = readFileSync("prisma/migrations/20261118010000_static_pages/migration.sql", "utf8");

describe("starter content", () => {
  it("has the five pages, in both languages, with matching structure", () => {
    expect(STARTER_PAGES.map((p) => p.slug)).toEqual([...STATIC_PAGE_SLUGS]);
    for (const p of STARTER_PAGES) {
      const si = markdownToBody(p.si.body);
      const en = markdownToBody(p.en.body);
      expect(si.content.map((b) => b.type), p.key).toEqual(en.content.map((b) => b.type));
      expect(p.si.title && p.en.title).toBeTruthy();
      expect(bodyText(si)).not.toBe(bodyText(en));
    }
  });

  it("invents no contact details", () => {
    for (const p of STARTER_PAGES) {
      for (const l of ["si", "en"] as const) {
        const text = p[l].body.replace(/\[\[[\s\S]*?\]\]/g, "");
        expect(text, `${p.key}/${l}`).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // email
        expect(text, `${p.key}/${l}`).not.toMatch(/(\+94|\b0)\d[\d\s-]{7,}/); // phone
      }
    }
  });

  it("marks the legal pages for review, so they cannot be published untouched", () => {
    for (const key of ["privacy", "terms"]) {
      const p = STARTER_PAGES.find((x) => x.key === key)!;
      expect(findPlaceholders(p.en.body)[0]).toMatch(/Legal review required/);
      expect(findPlaceholders(p.si.body)[0]).toMatch(/නීතිමය සමාලෝචනයක්/);
    }
    // Every page needs the publisher's details before publishing.
    for (const p of STARTER_PAGES) expect(findPlaceholders(p.en.body).length, p.key).toBeGreaterThan(0);
  });

  it("does not claim analytics or advertising networks", () => {
    const privacy = STARTER_PAGES.find((x) => x.key === "privacy")!.en.body;
    expect(privacy).toContain("We do not use advertising cookies or analytics cookies");
    expect(privacy).toContain("We do not currently use a third-party analytics service");
    expect(privacy).not.toMatch(/Google Analytics|AdSense|Meta Pixel/);
  });

  it("is what the migration inserts", () => {
    for (const p of STARTER_PAGES) {
      for (const l of ["si", "en"] as const) {
        expect(MIGRATION).toContain(`$page$${JSON.stringify(markdownToBody(p[l].body))}$page$::jsonb`);
        expect(MIGRATION).toContain(`$page$${p[l].title}$page$`);
      }
    }
    expect(MIGRATION).not.toMatch(/\bDROP\b|DELETE FROM|\bTRUNCATE\b|\bUPDATE "|ALTER TABLE "(?!StaticPageTranslation)/);
  });

  it("reserves the page addresses so categories cannot take them", () => {
    for (const s of STATIC_PAGE_SLUGS) expect(RESERVED_SLUGS.has(s)).toBe(true);
  });
});

describe("alignment and placeholders", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "a" }] },
      { type: "heading", attrs: { level: 2, textAlign: "right" }, content: [{ type: "text", text: "b" }] },
      { type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "c" }] },
      { type: "paragraph", attrs: { textAlign: "expression(alert(1))", style: "color:red", onclick: "x" }, content: [{ type: "text", text: "d" }] },
    ],
  };

  it("keeps alignment only where allowed, and only known values", () => {
    const pages = cleanBody(doc, { align: true })!;
    expect(pages.content.map((b) => b.attrs?.textAlign)).toEqual(["center", "right", undefined, undefined]);
    expect(JSON.stringify(pages)).not.toMatch(/style|onclick|expression/);
    expect(JSON.stringify(cleanBody(doc))).not.toContain("textAlign");
  });

  it("finds placeholders in any field", () => {
    expect(findPlaceholders("Email: [[address]]", "x", "[[a\nb]] and [[c]]")).toEqual(["[[address]]", "[[a\nb]]", "[[c]]"]);
    expect(findPlaceholders("[single] brackets are fine")).toEqual([]);
  });
});
