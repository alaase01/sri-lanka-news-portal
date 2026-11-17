# AI Editorial Assistant

Admin menu → **AI Editorial Assistant** (`/admin/ai`). Also reachable from any article's editor ("Open in the AI Editorial Assistant").

## What it does

Works on an existing article (either language version) or pasted text:

- Rewrite (styles: professional news reporting, formal journalistic, concise, neutral and factual, easy to understand) with optional editorial instructions
- Improve grammar and readability
- Translate Sinhala → English, English → Sinhala
- Improve the headline; suggest 5 alternative headlines

Optional source links (max 5) are passed to the model as reference text only. Nothing is fetched and no research is done. The assistant does not fact-check.

## Review and saving

The suggestion is shown beside the original (tabs on phones) with word counts, operation, output language, model, tokens and estimated cost. The suggestion can be edited, copied, regenerated or discarded. Nothing is saved until **Approve and save** and its confirmation.

| Target | What "Approve and save" does |
| --- | --- |
| Draft or unpublished version | Updates it. The previous text stays in the article's history (Restore). |
| Published or scheduled version | Not changed. Stored as an "AI suggestion (not applied)" revision; apply it with Restore in the editor. |
| Language version that doesn't exist yet (translation) | Creates it as a draft (you confirm the slug). |
| Pasted text | Creates a new draft article (you choose category and slug). |

A save is refused if the article was edited after the suggestion was generated. Links the model added that were not in the original are removed.

## Settings (`.env`, server only)

| Name | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Required to enable the assistant. Never commit it. |
| `AI_MODEL` | `claude-sonnet-5-5` | Rewrite, grammar, translation |
| `AI_MODEL_LIGHT` | `claude-haiku-5-5` | Headlines |
| `AI_EFFORT` | `medium` | `low` / `medium` / `high` reasoning effort |
| `AI_TIMEOUT_SECONDS` | `180` | Per request; one automatic retry for connection errors, 429 and 5xx |
| `AI_HOURLY_LIMIT` / `AI_DAILY_LIMIT` | `30` / `150` | Requests per admin |

Restart the site after changing them.

## Usage and cost

Each request adds a row to `AiUsageLog`: admin, operation, model, input/output tokens as reported by the API, success or error code, estimated cost (USD), time. No article text is stored. The cost uses list prices in `src/server/ai/pricing.ts` (checked 2026-11-17); unknown models get no estimate. Anthropic's invoice is the real cost. The table is ready for a later daily/monthly spend control.

## Code

- `src/server/ai/` — `client.ts` (only code that calls Anthropic), `prompts.ts` (system prompt with the editorial rules), `assistant.ts` (generate / approve), `pricing.ts`, `actions.ts` (server actions)
- `src/lib/content/markdown.ts` — article body ⇄ Markdown subset
- `src/lib/ai/options.ts` — operations and styles (shared with the page)
- `src/app/(admin)/admin/ai/page.tsx`, `src/components/admin/AiAssistant.tsx`

## Limitations

- Nested lists are flattened; tables/images are not supported in article bodies anyway.
- Article text up to 15,000 characters per request.
- The summary, SEO fields and slug are not rewritten.
- The rate limit's "one at a time" check is per server process (the site runs one).
