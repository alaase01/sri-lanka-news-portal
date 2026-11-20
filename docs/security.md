# Security

What is protected, how, and what is still to do. See also `docs/polls.md` for
voting integrity.

## Administrator account

- There is exactly one administrator and no registration page. The account is
  created on the server with `npm run admin:create`. To change the email or
  password, or to recover access, run `npm run admin:create -- --reset`, which
  also signs out every session. There is no web-based password reset by design:
  nobody can take over the account through the website.
- Passwords: at least 12 characters, at most 256, not on a short list of
  obvious choices, not built on the email name. No composition rules; a few
  unrelated words make a good password.
- Stored as Argon2id (64 MiB memory, 3 passes, 1 lane) via `@node-rs/argon2`.

## Sign-in

- `/admin/login`, a server action (`src/server/auth/actions.ts`).
- The same message for an unknown email and a wrong password. An unknown email
  is still checked against a dummy Argon2 hash, so response time does not reveal
  whether the account exists.
- Rate limiting (`src/config/auth.ts`):
  - 5 failed attempts for one account within 15 minutes pause that account;
  - 20 failed attempts from one network within 15 minutes pause that network;
  - a successful sign-in resets the count; blocked attempts are not recorded,
    so the pause ends 15 minutes after the last real attempt.
- Every attempt is recorded in `LoginAttempt` with a keyed hash of the email
  and the daily network hash, never the address or password.

## Sessions

- A 256-bit random token in a cookie: `__Host-rs_admin` in production
  (`rs_admin` in development). HttpOnly, Secure, SameSite=Strict, path `/`.
- The database stores only the token's SHA-256 (`AdminSession.tokenHash`).
- A session ends after 12 hours without activity, 7 days after sign-in, on
  sign-out, or when the credentials are reset. Every sign-in issues a new token.
- `lastSeenAt` is written at most every 5 minutes.

## Authorisation

- `requireAdmin()` (`src/server/auth/session.ts`) is the only check that counts.
  It runs in the admin root layout, again in every admin page, and must be the
  first line of every admin server action.
- `tests/unit/admin-guard.test.ts` fails if an admin page, or an exported server
  action outside sign-in/out, does not call it.
- `src/proxy.ts` redirects requests without a session cookie to the login page
  with a real 307. A request with a cookie that is forged or expired passes the
  proxy, is rejected by `requireAdmin()`, and receives an immediate in-page
  redirect to the login page; no admin content is sent.

## Cross-site request forgery

- Next.js rejects a server action whose `Origin` does not match the host.
- The admin cookie is SameSite=Strict.
- The voting API checks `Origin` itself (`src/server/polls/http.ts`).

## Security headers

Defined in `src/config/security-headers.ts`.

| Header | Public pages | Admin pages |
| --- | --- | --- |
| Content-Security-Policy | `script-src 'self' 'unsafe-inline'`; nothing from other sites | Per-request nonce with `'strict-dynamic'`; no inline scripts without the nonce |
| X-Frame-Options / `frame-ancestors` | DENY / `'none'` | DENY / `'none'` |
| X-Content-Type-Options | nosniff | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin | same |
| Permissions-Policy | camera, microphone, geolocation, payment, usb off | same |
| Cross-Origin-Opener-Policy | same-origin-allow-popups (so the Facebook/X/Telegram share window can finish) | same-origin |
| Strict-Transport-Security | 2 years, production only | same |
| Cache-Control | page caching rules | `no-store` |

Public pages allow inline scripts because they are cached and identical for
every visitor, so they cannot carry a per-request nonce. Every other source
(scripts, connections) is limited to this site. The one third party allowed is
`https://www.youtube-nocookie.com` in `frame-src`, for the video player, which
is only created after a reader presses play. An ad network or other third
party must be added to the policy deliberately.

The server makes one kind of outgoing request: when a video has no image, it
downloads YouTube's thumbnail from a fixed `https://i.ytimg.com/vi/<id>/…` address
built from the validated 11-character ID, with redirects refused, an 8-second
timeout and a 5 MB limit, and passes it through the normal image checks.

## Audit log

`AuditLog` records sign-in, sign-out, blocked sign-ins, administrator creation
and credential resets, with time and IP address. The dashboard shows the last
ten. Content changes will be added as the admin features are built. Never put
passwords, tokens, article text or reader submissions in the log.

## Output and input

- Server-side Zod validation on every server action and API route.
- React escapes all output; article bodies render through an allow-list;
  reader comments render as plain text.
- All database access goes through Prisma; search will use bound parameters only.
- Article bodies are cleaned on the server to the same allow-list the renderer
  uses; links are limited to http(s), mailto and site-relative paths.
- Content server actions accept only known fields, check every referenced id
  (category, tag, author, image) exists, and refuse to overwrite a version
  changed in another tab.

## Advertising

- Banner links must be http(s); `/go/ad/{id}` redirects only to the address stored for that banner (not an open redirect) and sends `Referrer-Policy: origin`.
- `/api/ads/view` accepts at most 10 known ids per request, same-site only (`Sec-Fetch-Site`), and stores daily counters only.
- Banner images are ordinary uploads (re-encoded, no scripts); links carry `rel="sponsored noopener"`.

## Image uploads

- Only the administrator can upload (server action with `requireAdmin()`).
- Size limit 8 MB; pixel limit 60 million; each side 200 to 12,000 pixels.
- The type is decided by decoding the file, not by its name or the browser's
  content type. SVG (which can contain scripts), GIF and anything else is refused.
- Every image is re-encoded to WebP, which removes EXIF data such as GPS
  location and camera owner, and anything appended after the image data.
- Stored names are random and generated by the server; the original file name
  is never used. The serving route accepts only the exact generated pattern, so
  no request can reach another file. Responses carry `nosniff` and a sandboxing
  Content Security Policy.

## Secrets

- `.env` only, never committed. The app refuses to start in production without
  `VOTE_SECRET` (also used to key the login-attempt hashes).
- Error messages name missing variables, never their values.

## AI Editorial Assistant

- The Anthropic API key is read from `ANTHROPIC_API_KEY` on the server only (`src/config/env.ts`, `src/server/ai/client.ts`, both `server-only`). It is never sent to the browser, returned by an action or written to logs. A test checks that no browser code imports these modules.
- Only signed-in admins can use it: the page and both server actions call `requireAdmin()`; Next.js server actions reject cross-site requests.
- Limits: one request at a time per admin, and `AI_HOURLY_LIMIT` / `AI_DAILY_LIMIT` requests per admin, counted from `AiUsageLog`.
- Article text, pasted text, instructions and source links are sent inside marked data sections; the system prompt tells the model to treat them as material, not instructions. The model has no tools and can only return JSON in a fixed shape. Its Markdown reply is converted through `cleanBody`, and any link that was not in the original article is removed.
- Source links must be http(s) without user names or passwords (at most 5). They are passed as text; nothing is fetched.
- Provider error messages are reduced to a code; the browser sees a fixed, plain message.
- `AiUsageLog` stores operation, model, token counts reported by the API, success/error code, estimated cost and admin — never article text.
- Nothing is saved without "Approve and save". Published and scheduled versions are never changed: the text is stored as an "AI suggestion" revision. A save is refused if the article changed after the suggestion was generated.

## Automated newsroom

- Runs entirely on the server; no browser session, admin password or browser automation. Drafts are created by an in-server function that only ever inserts new articles with status DRAFT in the World category (`createDraftPair`); there is no code path that publishes, schedules or edits existing articles, and no HTTP endpoint for it.
- The timer endpoint `/api/internal/newsroom/tick` needs `NEWSROOM_CRON_SECRET` (compared in constant time), refuses requests forwarded by the public web server, is blocked by Caddy, and can only start the run that is due.
- Admin controls (run, pause, settings, approve held, discard) are server actions behind `requireAdmin()` with audit logging.
- Web pages and search results are treated as data; sources and quotations are checked by code against what was really retrieved. Source text is kept in memory only during a run.
- The monthly AI budget is enforced before every AI call; only an admin can change it (Settings).

## Not yet done

- Malware scanning of uploads (re-encoding already discards non-image content).
- Dependency scanning in CI (there is no CI yet). `npm audit` currently reports
  advisories only in the lint toolchain; do not run `npm audit fix --force`.
- Backups and restore procedure.
- Purging old `LoginAttempt` and `PollEvent` rows (30 days).
- Two-factor authentication for the administrator (worth adding before launch).
- Deployment behind a reverse proxy that sets `X-Forwarded-For` (required for
  the network limits to be meaningful).
