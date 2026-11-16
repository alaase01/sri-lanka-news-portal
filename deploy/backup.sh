#!/usr/bin/env bash
# Nightly backup of the database and uploaded images (see deploy/README.md and the RSnewslk.com hosting guide).
# Keeps the last 14 days in /srv/rsnewslk/backups. Run as root from cron.
set -euo pipefail

DEST=/srv/rsnewslk/backups
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DEST"
chmod 700 "$DEST"

# Database: a consistent dump taken while the site keeps running.
docker exec "$(docker ps -qf name=db)" pg_dump -U rsnews -d rsnews -Fc > "$DEST/db_$STAMP.dump"

# Images: the processed uploads.
tar -C /srv/rsnewslk -czf "$DEST/media_$STAMP.tar.gz" media

# Remove backups older than 14 days.
find "$DEST" -type f -mtime +14 -delete

echo "Backup done: $DEST/db_$STAMP.dump and media_$STAMP.tar.gz"
