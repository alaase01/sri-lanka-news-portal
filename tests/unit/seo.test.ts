import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/components/seo/JsonLd";
import { xmlEscape } from "@/lib/seo/xml";
import { checkSocialUrl, socialProfiles } from "@/lib/seo/social";
import { breadcrumbJsonLd, organizationJsonLd, ownShareImage, OG_LOCALE } from "@/lib/seo/site";
import { SHARE_FILE_PATTERN, shareImageUrl } from "@/lib/content/media";
import robots from "@/app/robots";

describe("JSON-LD serialisation", () => {
  it("cannot close the script element or inject markup", () => {
    const out = serializeJsonLd({ headline: '</script><script>alert(1)</script> & "x"  ' });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(" ");
    expect(JSON.parse(out)).toEqual({ headline: '</script><script>alert(1)</script> & "x"  ' });
  });
});

describe("XML escaping", () => {
  it("escapes markup and drops invalid characters", () => {
    expect(xmlEscape(`a & b <c> "d" 'e'\u0001`)).toBe("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;");
    expect(xmlEscape("ශ්‍රී ලංකාව")).toBe("ශ්‍රී ලංකාව");
  });
});

describe("social profiles", () => {
  it("accepts only each network's own https addresses", () => {
    expect(checkSocialUrl("facebook", "https://www.facebook.com/rsnewslk")).toEqual({ url: "https://www.facebook.com/rsnewslk" });
    expect(checkSocialUrl("x", "https://twitter.com/rsnewslk#top")).toEqual({ url: "https://twitter.com/rsnewslk" });
    expect(checkSocialUrl("facebook", "")).toEqual({ url: null });
    expect(checkSocialUrl("facebook", "http://facebook.com/x")).toHaveProperty("error");
    expect(checkSocialUrl("facebook", "https://facebook.com.evil.example/x")).toHaveProperty("error");
    expect(checkSocialUrl("facebook", "https://notfacebook.com/x")).toHaveProperty("error");
    expect(checkSocialUrl("youtube", "https://www.youtube.com/")).toHaveProperty("error");
    expect(checkSocialUrl("youtube", "javascript:alert(1)")).toHaveProperty("error");
  });

  it("ignores stored junk", () => {
    expect(socialProfiles({ facebook: "https://facebook.com/a", x: "https://evil.example", other: "https://x.com/b", youtube: 5 })).toEqual([
      { key: "facebook", label: "Facebook", url: "https://facebook.com/a" },
    ]);
    expect(socialProfiles(null)).toEqual([]);
  });
});

describe("structured data and share images", () => {
  it("builds one Organization identity, with sameAs only when profiles exist", () => {
    const org = organizationJsonLd([]);
    expect(org).toMatchObject({ "@type": "NewsMediaOrganization", name: "RSnewslk.com", logo: { width: 336, height: 336 } });
    expect(org).not.toHaveProperty("sameAs");
    expect(organizationJsonLd(["https://facebook.com/a"]).sameAs).toEqual(["https://facebook.com/a"]);
  });

  it("numbers breadcrumbs from 1 with absolute URLs", () => {
    const b = breadcrumbJsonLd([{ name: "Home", path: "/en" }, { name: "Sport", path: "/en/sport" }]);
    expect(b.itemListElement.map((i) => [i.position, i.item])).toEqual([[1, "http://localhost:3000/en"], [2, "http://localhost:3000/en/sport"]]);
  });

  it("uses a 1200×630 JPEG only for large enough images", () => {
    const key = "a".repeat(32);
    expect(ownShareImage({ storageKey: key, width: 1600, alt: "x" })).toEqual({ url: `http://localhost:3000/media/${key}-og.jpg`, width: 1200, height: 630, alt: "x", type: "image/jpeg" });
    expect(ownShareImage({ storageKey: key, width: 500 })).toBeNull();
    expect(ownShareImage(null)).toBeNull();
    expect(SHARE_FILE_PATTERN.test(shareImageUrl(key).slice(7))).toBe(true);
    expect(SHARE_FILE_PATTERN.test("../etc/passwd-og.jpg")).toBe(false);
  });

  it("uses Facebook's locale codes", () => {
    expect(OG_LOCALE).toEqual({ si: "si_LK", en: "en_GB" });
  });
});

describe("robots.txt", () => {
  it("blocks only private areas and lists both sitemaps", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(["/admin", "/api/", "/go/"]);
    for (const publicPath of ["/si", "/en", "/media/", "/_next/", "/brand/", "/sitemap.xml"]) {
      expect((rule.disallow as string[]).some((d) => publicPath.startsWith(d))).toBe(false);
    }
    expect(r.sitemap).toEqual(["http://localhost:3000/sitemap.xml", "http://localhost:3000/news-sitemap.xml"]);
  });
});
