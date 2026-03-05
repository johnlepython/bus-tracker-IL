#!/bin/bash
set -e

export NETWORK_REF=ISRAEL
export REDIS_URL=redis://127.0.0.1:6379

cd /home/debian/bus-tracker-IL
exec /home/debian/bus-tracker-IL/apps/server/node_modules/.bin/tsx providers/stride/src/index.ts
