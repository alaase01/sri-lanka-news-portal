# Deployment files

Used by the RSnewslk.com hosting guide (one Ubuntu server: Node.js site,
PostgreSQL in Docker, Caddy for HTTPS). Nothing here contains secrets; the
server keeps them in `/srv/rsnewslk/db.env` and `/srv/rsnewslk/app/.env`.

| File | Goes to | Purpose |
| --- | --- | --- |
| `docker-compose.db.yml` | used in place | PostgreSQL 16, reachable from the server only (127.0.0.1) |
| `rsnewslk.service` | `/etc/systemd/system/` | Runs the site, restarts it, starts it at boot |
| `Caddyfile` | `/etc/caddy/Caddyfile` | HTTPS for rsnewslk.com, www redirect, forwards to port 3000 |
| `backup.sh` | run nightly by cron (root) | Database dump and image archive, 14 days kept |
| `update.sh` | run by the `rsnews` user | Pull, install, migrate, rebuild, restart |

Server folders: `/srv/rsnewslk/app` (code), `/srv/rsnewslk/media` (uploaded
images, `MEDIA_DIR`), `/srv/rsnewslk/postgres` (database files),
`/srv/rsnewslk/backups`.

First-time setup on an empty database: `npx prisma migrate deploy`, then
`npm run site:init` (site name, slogans, sections, menu; no articles), then
`npm run admin:create`. Never run `npm run db:seed` on the server.
