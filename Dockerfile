# syntax=docker/dockerfile:1.7
#
# Multi-target Dockerfile.
#
#   target=deps         used by docker-compose.dev.yml — source is bind-mounted
#                       in, this image just provides bun + node + node_modules
#                       so the host's source can run with hot-reload.
#
#   target=production   used by docker-compose.yml and the GHCR publish workflow
#                       — fully self-contained, no host mounts, runs the seeded
#                       backend with HTTPS via auto-generated certs.

# ============================================================
# Base — bun + real Node 22 + openssl/curl/ca-certs
# (oven/bun:1-slim ships only a bun shim for `node`, which fails to load native
#  modules like bcrypt and the Prisma engine; we need real Node from NodeSource.)
# ============================================================
FROM oven/bun:1 AS base
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && bun --version

# Bake the openssl config + cert generation script at a stable path so they're
# reachable from both production (where /app/certs is part of the image) and
# dev (where /app/certs is a named volume that hides anything baked at that path).
COPY docker/openssl.cnf.template /opt/openssl.cnf.template
COPY certs/create_certs.sh /opt/create_certs.sh
# Strip CR in case the host repo was cloned on Windows with core.autocrlf=true.
# Without this, the script silently writes filenames like `server.key\r` and the
# server then fails with ENOENT on `server.key`.
RUN tr -d '\r' < /opt/create_certs.sh > /opt/create_certs.tmp && mv /opt/create_certs.tmp /opt/create_certs.sh \
    && tr -d '\r' < /opt/openssl.cnf.template > /opt/openssl.cnf.tmp && mv /opt/openssl.cnf.tmp /opt/openssl.cnf.template \
    && chmod +x /opt/create_certs.sh

# ============================================================
# deps — install dependencies + generate Prisma client
# Used as the dev target. The dev compose mounts source on top
# and runs `node --watch index.js`, hot-reloading on host edits.
# ============================================================
FROM base AS deps
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
RUN bunx prisma generate

# ============================================================
# production — fully baked image used by GHCR + the release compose
# ============================================================
FROM base AS production
ENV NODE_ENV=production

# bring in node_modules + generated Prisma client from deps
COPY --from=deps /app/node_modules ./node_modules

# copy the rest of the application source (.dockerignore strips noise)
COPY . .

# entrypoint generates certs on first start, runs migrations/seed if requested.
# Pull the cert script + openssl config from /opt (already CRLF-stripped in base)
# instead of trusting whatever COPY . . brought in from the host repo.
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN cp /opt/create_certs.sh /app/certs/create_certs.sh \
    && cp /opt/openssl.cnf.template /app/certs/openssl.cnf \
    && tr -d '\r' < /usr/local/bin/entrypoint.sh > /usr/local/bin/entrypoint.tmp && mv /usr/local/bin/entrypoint.tmp /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh /app/certs/create_certs.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fk https://localhost:3000/ || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "index.js"]
