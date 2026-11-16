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
| Cross-Origin-Opener-Policy | same-origin | same |
| Strict-Transport-Security | 2 years, production only | same |
| Cache-Control | page caching rules | `no-store` |

Public pages allow inline scripts because they are cached and identical for
every visitor, so they cannot carry a per-request nonce. Every other source
(scripts, frames, connections) is limited to this site. When YouTube, an ad
network or other third parties are added, their hosts must be added to the
policy deliberately.

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

## Secrets

- `.env` only, never committed. The app refuses to start in production without
  `VOTE_SECRET` (also used to key the login-attempt hashes).
- Error messages name missing variables, never their values.

## Not yet done

- Image upload validation (with the upload feature).
- Dependency scanning in CI (there is no CI yet). `npm audit` currently reports
  advisories only in the lint toolchain; do not run `npm audit fix --force`.
- Backups and restore procedure.
- Purging old `LoginAttempt` and `PollEvent` rows (30 days).
- Two-factor authentication for the administrator (worth adding before launch).
- Deployment behind a reverse proxy that sets `X-Forwarded-For` (required for
  the network limits to be meaningful).
