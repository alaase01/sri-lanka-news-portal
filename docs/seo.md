# Technical SEO

## Public addresses

| Address | What it is |
| --- | --- |
| `/robots.txt` | Crawling rules. Allows everything public; disallows `/admin`, `/api/`, `/go/` (ad-click redirects). Lists both sitemaps. |
| `/sitemap.xml` | Sitemap index → `/sitemaps/pages.xml` and `/sitemaps/articles-si-N.xml`, `/sitemaps/articles-en-N.xml` (10,000 articles per file). |
| `/sitemaps/pages.xml` | Home pages, visible sections, published static pages, videos and polls, in both languages. |
| `/news-sitemap.xml` | Google News: articles first published in the last 48 hours (max 1,000), publication name `RSnewslk.com`, language `si`/`en`, original publication time. Can be empty; that is allowed. |
| `/media/<key>-og.jpg` | 1200 × 630 JPEG share image, made once from the featured image (≥ 600 px wide) and kept on disk. |
| `/brand/og-default.jpg` | Built-in default share image; `/brand/rsnewslk-logo-336.png` is the logo in structured data. |

Sitemaps only contain what the public pages show (published, or scheduled with the time passed; not deleted; visible sections) at canonical addresses. They use the same cache tags as the pages, so publishing, unpublishing, editing or deleting updates them within minutes.

`lastmod` and `dateModified` come from `ArticleTranslation.modifiedAt`: set only when the headline, summary or text of an already-public article changes. Status-only saves and draft edits don't count. The Google News sitemap uses the original `publishedAt`, so an edited old article never reappears as news.

## On every public page

- Canonical URL; hreflang `si`, `en` and `x-default` (Sinhala) only when the other language version exists (articles, sections page 1, static pages, videos, polls, home).
- Complete Open Graph (`og:title`, `og:description`, `og:type`, `og:url`, `og:image` + width/height/type/alt, `og:site_name`, `og:locale` `si_LK`/`en_GB`, `og:locale:alternate`) and X (`summary_large_image`). Articles add `article:published_time`, `modified_time`, `section`, `tag`. All in the server-rendered HTML.
- JSON-LD: `NewsMediaOrganization` (one `@id`, logo, `sameAs` from Settings) on every page; `NewsArticle` and `BreadcrumbList` on articles; `BreadcrumbList` on sections. Serialised with `<`, `>`, `&`, U+2028/9 escaped.
- Author in NewsArticle: the byline when there is one, otherwise the publication (as shown on the page). Nothing is invented.

## Admin → Settings

Official social profiles (each network accepts only its own `https://` addresses) and the default share image. Profiles appear in the footer and in the Organization `sameAs`.

## Google Search Console (administrator)

1. **Add the site:** go to search.google.com/search-console → *Add property*. Prefer **Domain** (`rsnewslk.com`) and verify with the DNS TXT record at your domain registrar; this needs no change to the site. Alternatively choose **URL prefix** (`https://rsnewslk.com/`) → *HTML tag*, copy only the `content="…"` value into `GOOGLE_SITE_VERIFICATION` in the server's `.env`, restart the site (`systemctl restart rsnewslk`) and click *Verify*.
2. **Submit sitemaps:** *Sitemaps* → enter `sitemap.xml` → *Submit*; then `news-sitemap.xml` → *Submit*.
3. **Inspect an article:** paste its full URL in the search bar at the top → *URL inspection*. *Test live URL* shows whether Google can fetch it, the canonical it chose and the structured data it found. *Request indexing* for important new stories.
4. **Indexing status:** *Indexing → Pages* lists indexed pages and reasons others are not.
5. **Sitemap errors:** *Sitemaps* shows status and discovered URLs for each sitemap; click one for details.
6. **Structured data:** *Enhancements / Shopping & Experience* sections (e.g. *Breadcrumbs*) list valid items and errors, where Google reports them for this site.
7. **Google News:** if the site appears in Google News, *Performance → Google News* shows clicks and impressions there. Inclusion is decided by Google; submitting a sitemap does not guarantee it. Publisher Center (publishercenter.google.com) is where you manage the publication; use the name **RSnewslk.com** exactly.

## Checking previews without Search Console

- Rich Results Test: search.google.com/test/rich-results (paste an article URL).
- Schema validator: validator.schema.org.
- Facebook Sharing Debugger: developers.facebook.com/tools/debug (*Scrape again* refreshes Facebook's cached preview; WhatsApp uses the same tags).
