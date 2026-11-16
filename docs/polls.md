# Public Opinions (මහජන මතය): how voting works

This document covers the polling system's design, the one-vote rule, what is
and is not stored about voters, and the limits of the approach.

## Overview

- A poll is one record shared by both editions. `/si/public-opinions/{slug}` and
  `/en/public-opinions/{slug}` show the same poll with the same slug, and votes
  from either edition go into one tally.
- Question, description and option labels are translated per language. A poll
  needs only one language; it is simply absent from the other edition.
- Results are always counted from the `PollVote` rows. There is no stored total
  that could drift.

## Lifecycle

Stored status: `DRAFT → SCHEDULED → ACTIVE → CLOSED → ARCHIVED`.

Whether voting is open is decided from `startsAt` and `endsAt` on every request
(`src/lib/polls/phase.ts`), never from the status alone:

| Stored status | Before start | Between start and end | After end |
| --- | --- | --- | --- |
| `SCHEDULED` or `ACTIVE` | upcoming | **open** | closed |
| `CLOSED` | closed | closed | closed |
| `ARCHIVED` | archived | archived | archived |
| `DRAFT` | not public | not public | not public |

So a published poll opens and closes on time with no background job, and the
voting API cannot be fooled by a stale status. Times are stored in UTC and shown
in Sri Lanka time (UTC+05:30).

## One vote per recognised device per poll

### How a device is recognised

1. When a visitor opens a poll, the page calls `GET /api/polls/{id}/state`.
2. If the browser has no valid voting cookie, the server generates 32 random
   bytes and sets a cookie `token.issuedAt.signature`. The signature is an HMAC
   with the server's `VOTE_SECRET`, so the server can tell a cookie it issued
   from one that was typed in or edited.
3. The cookie is `HttpOnly` (page scripts cannot read it), `SameSite=Lax`,
   `Secure` in production (named `__Host-rs_vd`), lasts 400 days and is renewed
   on each visit.
4. The database never sees the token. Votes store `deviceHash`, an HMAC of the
   token. Someone reading the database cannot recreate a voter's cookie.

The device identifier is never taken from a request parameter, the code name is
never used as an identifier, and no browser fingerprinting is done.

### How duplicates are prevented

- `PollVote` has `UNIQUE(pollId, deviceHash)`. This database constraint is the
  guarantee. Two simultaneous requests from one device cannot both be stored.
- The engine (`src/server/polls/vote.ts`) also checks first, so the visitor gets
  a clear "already voted" answer, and records the attempt.
- Changing the code name, or switching between anonymous and code name, changes
  nothing: the constraint is on the device, not the name.
- `PollVote(optionId, pollId)` references `PollOption(id, pollId)`, so the
  database also refuses a vote for an option from a different poll.

### What this can and cannot do

This recognises a **browser profile**, not a physical computer or a person. A
website cannot do better without collecting personal data.

| Situation | Result |
| --- | --- |
| Same browser votes again | Blocked |
| Different browser on the same computer | Counts as another device |
| Private/incognito window | Counts as another device |
| Cookies cleared | Counts as another device |
| Shared computer, same browser profile | Only one person can vote |
| Cookie edited or invented | Rejected (signature check) and logged |
| Script that fetches a cookie and votes at once | Rejected (token must be 3 seconds old) |
| Determined person repeatedly clearing cookies | Slowed by the network limits below, not stopped |

These polls measure reader opinion. They are not suitable for anything that
needs verified one-person-one-vote.

## Network checks (secondary signal)

A missing cookie is not assumed to mean a new, legitimate device. Each vote
carries `networkHash`: an HMAC of the visitor's IP address (IPv6 reduced to its
/64) keyed with the secret **and the date**. It is used only for these limits,
all set in `src/config/voting.ts` and overridable by environment variable:

| Limit | Default | Purpose |
| --- | --- | --- |
| Votes from **fresh** devices on one network, per poll | 5 per 10 minutes | Slows clear-cookies-and-revote |
| All votes from one network, per poll | 60 per hour | Ceiling against automation |
| Rejected attempts from one network | 30 per 10 minutes | Pauses a misbehaving client |

A device is "fresh" when its token is under 10 minutes old. A browser that was
recognised earlier is exempt from the fresh-device limit, so family members,
colleagues or students sharing one connection are not blocked by each other.

The site must sit behind a reverse proxy that sets `X-Forwarded-For` itself.
Without one, the header can be forged and the network limits can be bypassed.
If no address is available, network limits are skipped; the device rule still
applies.

## Privacy

Stored with a vote: the option, the device hash, anonymous-or-code-name, the
code name if given, the edition, the daily network hash, a fresh-device flag and
the time.

Not stored: IP addresses, user agents, device tokens, fingerprints.

- The network hash changes every day, so activity cannot be followed across
  days, and it cannot be turned back into an address.
- `PollEvent` (rejected and suspicious attempts) holds only hashes and should be
  purged after 30 days. The purge job is not built yet.
- Public responses contain option totals, and for approved comments the display
  name and text. Nothing else leaves the server; the tests assert this.

## Comments

- Optional, plain text, at most 400 words (checked in the form and on the server).
- Stored with status `PENDING`. Only `APPROVED` comments are returned by the API.
- A comment hangs off its vote. Hiding or deleting a comment never touches the
  vote, and a vote counts while its comment is pending.
- No HTML is accepted or produced. Text is rendered as text; markup typed by a
  visitor shows as characters and marks the comment `flagged` for the moderator,
  as do links and long repeated characters.
- The form includes a hidden field that people do not see; submissions that fill
  it are dropped.

## Results visibility

Per poll: `AFTER_VOTE` (default: a device sees results once it has voted),
`ALWAYS`, or `AFTER_CLOSE`. Everyone sees final results once a poll has closed.
Percentages are whole numbers that always total 100.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/polls/{id}/state?locale=` | Live phase, whether this device has voted, results if allowed. Issues the device cookie. |
| `POST /api/polls/{id}/vote` | Casts a vote. Requires a same-origin `Origin` header, JSON, and an existing device cookie. |
| `GET /api/polls/{id}/comments?cursor=` | Approved comments, 10 per page. |

Poll pages themselves are cached and identical for every visitor; everything
specific to a device comes from these routes.

## Not built yet

- Admin screens for polls, comment moderation and voting analytics.
- Audit entries for administrative poll changes (the `AuditLog` table exists).
- The 30-day purge of `PollEvent`.
- Optional featured image on polls (the column exists).
