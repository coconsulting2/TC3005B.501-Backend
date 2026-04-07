#!/usr/bin/env bash
# Backend container entrypoint.
#  1. Generates self-signed HTTPS certs on first start (idempotent — only if missing).
#  2. If RUN_MIGRATIONS=true: applies the Prisma schema to the configured database.
#  3. If SEED_DUMMY_DATA=true and the seeded sentinel is missing: runs the seed once.
#  4. Hands off to CMD via exec so node becomes PID 1 and receives signals.
set -euo pipefail

cd /app/certs
if [ ! -f server.crt ] || [ ! -f server.key ] || [ ! -f ca.crt ]; then
  echo "[entrypoint] HTTPS certs missing — generating..."
  # /app/certs may be a named volume that hid the baked-in script and config,
  # so always seed them from /opt before running.
  cp /opt/openssl.cnf.template /app/certs/openssl.cnf
  cp /opt/create_certs.sh /app/certs/create_certs.sh
  chmod +x /app/certs/create_certs.sh
  ./create_certs.sh
else
  echo "[entrypoint] HTTPS certs present — reusing."
fi

cd /app

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] Applying Prisma schema (db push)..."
  bunx prisma db push --accept-data-loss
fi

# Sentinel lives in the certs volume so we don't need a 4th named volume.
SEED_SENTINEL=/app/certs/.seeded
if [ "${SEED_DUMMY_DATA:-false}" = "true" ] && [ ! -f "$SEED_SENTINEL" ]; then
  echo "[entrypoint] Seeding dummy data (first start)..."
  node prisma/seed.js dev
  touch "$SEED_SENTINEL"
elif [ -f "$SEED_SENTINEL" ]; then
  echo "[entrypoint] Seed sentinel found — skipping seed."
fi

echo "[entrypoint] Starting server: $*"
exec "$@"
