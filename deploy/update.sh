#!/usr/bin/env bash
# Puts the latest code from GitHub live (see deploy/README.md and the RSnewslk.com hosting guide).
# Run as the rsnews user:  bash /srv/rsnewslk/app/deploy/update.sh
# The site is unavailable for about 2-3 minutes while it rebuilds.
set -euo pipefail
cd /srv/rsnewslk/app

git pull --ff-only
npm ci
npx prisma generate
npx prisma migrate deploy

sudo systemctl stop rsnewslk
npm run build
sudo systemctl start rsnewslk

echo "Update finished. Check https://rsnewslk.com and the admin sign-in."
