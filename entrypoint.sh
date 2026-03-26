#!/bin/sh
PUID=${PUID:-1000}
PGID=${PGID:-1000}

mkdir -p /app/data
chown -R ${PUID}:${PGID} /app/data

exec gosu ${PUID}:${PGID} bun run src/server/index.ts
