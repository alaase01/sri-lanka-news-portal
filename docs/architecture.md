# Architecture

Approved 15 November 2026. This file records the decisions the code depends on.

## Overview

One Next.js application serves the public site and `/admin`, backed by one PostgreSQL database. Routes stay thin and call services in `src/server/`; only that folder touches the database, the AI provider or the file system.

| Layer | Choice |
| --- | --- |
| Framework | Next.js App Router, React, TypeScript (strict) |
| Styling | Tailwind CSS with design tokens |
| Database | PostgreSQL 16+ with `pg_trgm` and `unaccent` |
| Data access | Prisma; raw parameterised SQL only for search |
| Validation | Zod, checked on the server for every input |
| Authentication | Argon2id password hash; opaque session token stored as a SHA-256 hash |
| Editor | Tiptap, saved as ProseMirror JSON |
| AI | `AiProvider` interface with an Anthropic implementation; key held on the server |
| Images | `sharp` re-encoding on upload, behind a `MediaStorage` interface |

## Editions and URLs

- Two editions: Sinhala (`si`, default) and English (`en`).
- Every public URL starts with the locale: `/{locale}/{category path}/{article slug}`, `/{locale}/tag/{slug}`, `/{locale}/search`.
- `/` redirects permanently to `/si/`. Readers are never redirected by browser language.
- Slugs are Latin script in both editions and unique within a language.
- Listings are paginated in the path, not the query string: `/si/politics/page/2`. `page` is therefore a reserved word that no category or article slug may use. Page 1 has no suffix.
- An article has one URL, built from its primary category path. The same slug under any other category prefix answers with a permanent redirect.

## Rendering and caching

- Each edition has its own root layout (`src/app/(si)`, `src/app/(en)`), so `<html lang>` is static. The route files are thin; the shared implementations live in `src/routes/`.
- All content queries in `src/server/services/content.ts` are cached with `use cache`, a lifetime (`minutes` for article listings, `hours` for categories and navigation) and tags (`articles`, `categories`, `navigation`, `settings`, `tags`, `homepage`). The admin portal will invalidate by tag on publish.
- The layouts set `ensureStatic = "navigation"`: a page renders completely before the response starts. This is what makes a missing page answer 404 and a moved article answer 308, instead of a 200 shell.
- Because of that setting, public pages cannot read cookies, headers or the query string on the server.
- `next build` needs the database, because section and tag pages are prerendered.
- Times: the server prints the absolute time; the browser replaces it with a relative time. Dates are formatted by hand (`src/lib/utils/dates.ts`) because Sinhala locale data differs between browsers.

## Multilingual data model

Each piece of reader-facing content is a language-neutral identity row plus one translation row per language.

| Content | Shared row | Translation row (one per language) |
| --- | --- | --- |
| Article | primary category, extra categories, tags, author, featured image, soft-delete flag | headline, summary, body, slug, SEO fields, status, scheduled and published times |
| Category | parent, sort order, visibility, icon | name, slug, description, SEO fields |
| Tag | identity | name, slug |
| Author | photo | display name, bio |
| Media | file, dimensions, credit | alt text, caption |
| Video | YouTube ID, duration, thumbnail, linked article | title, description |
| NavigationItem | target, parent, order, visibility | label |
| HomepageSection | type, order, on/off, settings | heading |

Rules:

- **Independent publishing.** Status and dates sit on the translation. Either language can exist without the other.
- **No fallback.** An edition lists only content that has a translation in that language.
- **Per-edition curation.** Featured articles, breaking news and view counts carry a locale.
- **Canonical and hreflang.** Each translation is canonical to its own URL. When both are published, each page lists `hreflang` for `si`, `en` and `x-default` (Sinhala).
- **Interface text** lives in `src/lib/i18n/si.json` and `en.json`, not in the database.
- **Scheduled publishing** is decided at query time: a `SCHEDULED` translation counts as published once `scheduledAt` has passed.
- **Deletion.** Articles are soft-deleted. A category with articles or children cannot be deleted.
- **No circular categories.** Checked in the service and again by a database trigger.

## Search

- Text is normalised and tokenised by the application: Unicode NFC, zero-width joiners removed, punctuation stripped.
- Sinhala: `simple` text-search configuration with prefix matching, plus trigram indexes for partial words; a folded column absorbs common spelling variants.
- Phonetic (Singlish): each Sinhala translation is transliterated to Latin letters and folded to a loose phonetic key. Latin-letter queries are folded the same way and matched against it. Exact Sinhala matches rank first.
- English edition: PostgreSQL's `english` configuration.
- Each edition searches only its own translations.

## Security

- No admin registration; the administrator is created by a script run on the server.
- Every admin action checks the session on the server, then the request origin, then the input schema.
- Article bodies are stored as JSON and rendered from an allow-list of node types.
- Uploads are images only, identified by content, re-encoded, and stored under generated names.
- Secrets come from environment variables and never reach the browser.

## Admin area

- `/admin/login` has its own root layout (`src/app/(admin-auth)`); every other admin page sits under `src/app/(admin)`, whose root layout checks the session before rendering anything.
- Admin pages render per request (`instant = false`), are never cached, and carry `noindex`.
- `src/proxy.ts` runs only for `/admin`: it adds a per-request nonce and strict Content Security Policy, and redirects requests without a session cookie to the login page.
- Admin data access lives in `src/server/admin/`, authentication in `src/server/auth/`. See [security.md](security.md).

## Article sharing

`src/components/article/ShareBar.tsx` on every article page: WhatsApp, Facebook, X, Telegram, copy link, and the device's native share sheet where the browser has one. Links are built by `src/lib/share.ts` from the article's absolute canonical URL for that edition. The bar is rendered only by the article page, which exists only for published articles, so no share link is ever produced for unpublished or hidden content. Article metadata carries Open Graph and Twitter card tags; there is no share image until image upload exists.

## Public Opinions

See [polls.md](polls.md). In short: one poll and one tally across both editions; a signed, server-issued device cookie; `UNIQUE(pollId, deviceHash)` in the database; whether voting is open is decided from start and end times on each request; comments are plain text and need approval.

Reserved first path segments under each edition, which no category slug may use: `tag`, `page`, `public-opinions`, `developer`.

## Developer credit

A small "Website by …" line under the footer links to `/{locale}/developer`, a page about the site's developer. Its text and contact details live in `src/config/developer.ts`; empty contact entries are not shown.

## Database additions (Increment 2)

Migration `20261116010000_videos_and_polls` is additive: it drops nothing, and new columns on existing tables are nullable or defaulted.

| Table | Purpose |
| --- | --- |
| `Poll` | Shared identity: slug, status, hidden flag, start and end times, results visibility |
| `PollTranslation` | Question, description, SEO fields per language |
| `PollOption`, `PollOptionTranslation` | Ordered options and their labels per language |
| `PollVote` | One row per vote: option, device hash, identity, code name, edition, daily network hash |
| `PollComment` | Optional comment on a vote, with moderation status |
| `PollEvent` | Rejected and suspicious attempts, hashes only |
| `VideoTag` | Tags on videos |

`Video` gains category, status, schedule, featured flag, sort order and soft delete; `VideoTranslation` gains slug and SEO fields. Administrative poll changes will be recorded in the existing `AuditLog`, so there is no separate poll audit table.

## Advertising

Four positions are reserved, defined in `src/components/ads/AdSlot.tsx`:

| Slot | Where | Desktop | Phone |
| --- | --- | --- | --- |
| `top` | Under the header on every page | 970×90 | 320×100 |
| `home-mid` | Homepage, between Top Stories and the category sections | 970×250 | 300×250 |
| `in-article` | After the third block of an article body | 300×250 | 300×250 |
| `in-feed` | After the eighth story on category and tag pages | 728×90 | 300×250 |

A homepage rectangle and an article sidebar were considered and dropped. Slots render nothing in production until ad management exists; in development they show labelled placeholders at their real size. The ad source (own banners, an ad network, or both) is not decided yet.

## Deferred

Hosting and news alerts are decided in later increments and add no dependencies now.
