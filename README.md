# RSnewslk.com

Sri Lankan digital news website with Sinhala (`/si/`, default) and English (`/en/`) editions and a single-administrator content management portal.

**Status:** the reading site (homepage, category, article and tag pages), article sharing, and the public side of Public Opinions (poll listing, voting, results, approved comments) work in both editions on fictional demo content.

The admin portal has secure sign-in and a dashboard at `/admin`.

**Not built yet:** admin editing screens (articles, categories, tags, media, videos, polls, comments), public video pages, search, image upload and view counting. Content can currently only be changed through the seed script or the database.

## Stack

- Next.js (App Router), React, TypeScript, Tailwind CSS
- PostgreSQL 16+ with Prisma
- Zod for validation

## Getting started

Requirements: Node.js 22+, PostgreSQL 16+.

```bash
npm install
cp .env.example .env        # then set DATABASE_URL (and VOTE_SECRET before a production build)
npx prisma migrate dev      # creates the tables
npx prisma generate         # generates the database client
npm run db:seed             # loads FICTIONAL demo content (wipes content tables first)
npm run admin:create        # create the administrator (asks for email and password)
npm run dev                 # http://localhost:3000, admin at /admin

npm run build && npm start  # production build; needs the database running
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply schema changes to the development database |
| `npm run db:generate` | Regenerate the Prisma client into `src/generated` |
| `npm run db:seed` | Replace all content with fictional demo content (refuses to run in production) |
| `npm run admin:create` | Create the single administrator; add `-- --reset` to change the email or password and sign out all sessions |
| `npm run typecheck` / `npm run lint` | Type checking and linting |
| `npm test` | Unit and integration tests. The integration tests use the database in `DATABASE_URL`; they create their own polls and remove them afterwards |
| `npm run test:unit` | Unit tests only (no database needed) |

## Documentation

- [docs/architecture.md](docs/architecture.md): architecture, multilingual data model, URL and SEO rules, search design, security approach, increments
- [docs/security.md](docs/security.md): administrator sign-in, sessions, headers, audit log
- [docs/polls.md](docs/polls.md): how voting works, the one-vote-per-device rule, privacy, and known limits
- [prisma/schema.prisma](prisma/schema.prisma): the database schema

## Increments

1. Reading site: schema, fictional Sinhala seed content, homepage, category and article pages
2. Admin core: login, article management, categories, tags, image upload
3. Search: Sinhala, phonetic (Singlish) and English search with filters and suggestions
4. AI rewriting, homepage curation, SEO, alerts, security hardening, deployment
