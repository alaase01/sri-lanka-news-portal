import { describe, expect, it } from "vitest";
import { buildShareLinks } from "@/lib/share";

describe("buildShareLinks", () => {
  const url = "https://rsnewslk.com/si/politics/parliament/special-session";
  const title = "පාර්ලිමේන්තුවේ විශේෂ රැස්වීමක් & more?";
  const links = buildShareLinks(url, title);

  it("targets each platform's share endpoint over https", () => {
    expect(links.whatsapp.startsWith("https://wa.me/?text=")).toBe(true);
    expect(links.facebook.startsWith("https://www.facebook.com/sharer/sharer.php?u=")).toBe(true);
    expect(links.x.startsWith("https://twitter.com/intent/tweet?")).toBe(true);
    expect(links.telegram.startsWith("https://t.me/share/url?")).toBe(true);
  });

  it("carries the exact article URL, percent-encoded", () => {
    expect(new URL(links.facebook).searchParams.get("u")).toBe(url);
    expect(new URL(links.x).searchParams.get("url")).toBe(url);
    expect(new URL(links.telegram).searchParams.get("url")).toBe(url);
    expect(new URL(links.whatsapp).searchParams.get("text")).toBe(`${title} ${url}`);
  });

  it("carries the Sinhala headline intact and cannot break out of the query string", () => {
    expect(new URL(links.x).searchParams.get("text")).toBe(title);
    expect(links.x).not.toContain("& more");
    expect(links.telegram).not.toContain(" ");
  });

  it("keeps the edition in the shared URL", () => {
    const en = buildShareLinks("https://rsnewslk.com/en/economy/story", "Story");
    expect(new URL(en.facebook).searchParams.get("u")).toContain("/en/");
  });
});
