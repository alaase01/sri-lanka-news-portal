# RSnewslk.com

Sri Lankan digital news website with Sinhala (`/si/`, default) and English (`/en/`) editions and a single-administrator content management portal.

**Status: Increment 1 (reading site) built.** Homepage, category pages, article pages and tag pages work in both editions on fictional demo content. There is no admin portal, search, image upload or view counting yet.

## Stack

- Next.js (App Router), React, TypeScript, Tailwind CSS
- PostgreSQL 16+ with Prisma
- Zod for validation

## Getting started

Requirements: Node.js 22+, PostgreSQL 16+.

```bash
npm install
cp .env.example .env        # then set DATABASE_URL
npx prisma migrate dev      # creates the tables
npx prisma generate         # generates the database client
npm run db:seed             # loads FICTIONAL demo content (wipes content tables first)
npm run dev                 # http://localhost:3000

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
| `npm run typecheck` / `npm run lint` | Type checking and linting |

## Documentation

- [docs/architecture.md](docs/architecture.md): architecture, multilingual data model, URL and SEO rules, search design, security approach, increments
- [prisma/schema.prisma](prisma/schema.prisma): the database schema

## Increments

1. Reading site: schema, fictional Sinhala seed content, homepage, category and article pages
2. Admin core: login, article management, categories, tags, image upload
3. Search: Sinhala, phonetic (Singlish) and English search with filters and suggestions
4. AI rewriting, homepage curation, SEO, alerts, security hardening, deployment
