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

## Deferred

Hosting, news alerts and advertising are decided in later increments and add no dependencies now.
