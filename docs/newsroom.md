# Automated Global Newsroom

Researches significant world news four times a day and prepares original English and Sinhala articles as **linked drafts** in the World category. It never publishes, schedules or edits existing articles. Every draft needs an editor's review.

> Automated screening reduces copyright and accuracy risk but is **not legal advice and does not guarantee compliance** (including with the Intellectual Property Act No. 36 of 2003). The editor remains responsible for what is published.

## How a run works

1. **Discover** (research model, web search limited to `TRUSTED_DOMAINS` in `src/server/newsroom/config.ts`): up to 6 candidate developments from roughly the last six hours, with importance 1–5. Recent headlines are given so covered stories are skipped. Sources not present in the actual search results, or outside the trusted list, are dropped by code.
2. **Select:** reject duplicates (a source already used by an earlier story, or ≥ 50% word overlap with a recent article or story; ≥ 80% if the model says it is a genuine new development), importance below 3, and stories without a trusted source. Stop at the "stories per run" setting (default 2, max 5).
3. **Research and verify** (research model, web fetch + web search, trusted domains only): facts in the model's own words, each labelled confirmed / official / allegation / opinion / unverified, with its sources; conflicts and open questions; sources with publisher, author, publication and access time. Code drops facts whose sources were not really read or found, and quotations not found word for word in a fetched page. Fewer than 3 confirmed or official facts → rejected ("too little evidence").
4. **Write** (writing model, no tools): English and Sinhala from the **fact list only**; the writer never sees source text. Each body must be 60/40–400 words; one retry if not.
5. **Screen** (code, not AI), English draft vs. the fetched pages:
   - longest shared passage ≥ 25 words or ≥ 15% shared 8-word phrases → **HIGH** (rejected);
   - ≥ 12 words or ≥ 5% → **MEDIUM**;
   - headline close to a source headline, a quotation not found word for word, over 60 quoted words, only one independent publisher, conflicting reports, or different figures in the two language versions → **MEDIUM**.
   - MEDIUM stories are **held** (separate review queue, not drafts). LOW stories become drafts.
6. **Drafts:** one article, English + Sinhala `DRAFT` versions, same slug, World category, no image (the site's default image is used), SEO description from the writer, revision note "Created by the automated newsroom". Both versions are created in one database transaction.

Stored per story (`NewsroomStory`): the candidate, facts, quotations, conflicts, sources, verification, copyright risk and reasons, similarity figures, word counts, model, draft link. Full source articles are never stored.

## Schedule

- `deploy/rsnewslk-newsroom.timer` calls `POST http://127.0.0.1:3000/api/internal/newsroom/tick` every 10 minutes with `NEWSROOM_CRON_SECRET`. The endpoint answers 404 to anything without the secret or coming through the public web server; Caddy also blocks `/api/internal/`.
- A run starts for each slot (00:00, 06:00, 12:00, 18:00 Asia/Colombo) once, within 3 hours of the slot time. The slot key is unique, so a slot cannot run twice. A failed run is retried after 10 and 20 minutes (3 attempts). A lock prevents overlapping runs; a run that holds it for 45 minutes is treated as crashed.
- Times are stored in UTC and shown in Sri Lanka time.

## Budget

All AI use on the site (newsroom and Editorial Assistant) counts against a monthly limit (Settings → Monthly AI budget, default USD 20, Sri Lanka calendar month). Costs come from the token and search counts the API reports and the prices in `src/server/ai/pricing.ts` (web search USD 10 per 1,000). Before each AI call its worst-case cost is reserved; if it does not fit, the call is not made. Notices at 75%, 90% and 100%. Also set a spending limit in the Anthropic Console as a second safeguard.

## Settings (`.env`, server only)

| Name | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Already used by the Editorial Assistant. |
| `NEWSROOM_CRON_SECRET` | At least 32 random characters; lets the timer start runs. |
| `NEWSROOM_RESEARCH_MODEL` | Default `claude-haiku-5-5`. |
| `NEWSROOM_WRITING_MODEL` | Default `claude-sonnet-5-5`. |

In the Anthropic Console, web search must be allowed for your organisation.

## Sites that block Anthropic's crawler

Some publishers close their sites to Anthropic's crawler (as of 2026-11-19: Reuters, AP, BBC, DW, The Guardian, NHK). The API refuses requests that include them, so they are not in `TRUSTED_DOMAINS`. If another listed site starts blocking, the run leaves it out automatically, tries again, and shows a notice naming it; then remove it from the list. The newsroom never works around a site's crawler rules.

## First manual test

1. Admin → **Automated Global Newsroom** → **Run now** (works while scheduling is off). The page refreshes itself; a run takes a few minutes.
2. Check **Run history** (counts and cost), **Generated drafts**, **Held for review**, and open each story: sources, facts, screen results.
3. Open the drafts (links in the table), read both languages against the sources, then publish or delete as normal.
4. When satisfied, **Switch on scheduled runs** (only possible after a successful manual run). **Pause** at any time.
