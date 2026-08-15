# syntax=docker/dockerfile:1

# One image, three entrypoints: the HTTP server, the background worker, and the
# migration runner. They are the same codebase by design (see docs/architecture.md),
# so shipping them as one artifact is what makes "the worker runs the same code
# the API does" true of the thing actually deployed rather than only of the repo.
#
# Build from the REPOSITORY ROOT, not from this directory:
#     docker build -f apps/api/Dockerfile -t finance-api .
# The API depends on the `@finance/schemas` workspace, so the build context has
# to contain both packages. An earlier version of this file copied only
# `apps/api` and could neither install nor compile.
#
# Debian slim rather than alpine, for the same reason `docker-compose.yml` pins
# Debian Postgres: under this machine's Docker Desktop/WSL2 setup a musl image
# cannot exec its own `/bin/sh` ("exec format error"), so an alpine base could
# not be built here at all, let alone tested.

# ---- 1. build --------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# Manifests and the shared package first, so this layer stays cached until a
# dependency really changes. `packages/schemas` comes in whole rather than as
# its manifest alone because `npm ci` compiles it through its own `prepare`
# script -- and **`--ignore-scripts` does not prevent that**: npm runs `prepare`
# for a linked workspace regardless, so a stage without the sources fails with
# `TS5058: The specified path does not exist: 'tsconfig.json'`.
COPY package.json package-lock.json ./
COPY packages/schemas ./packages/schemas
COPY apps/api/package.json apps/api/

# `apps/web/package.json` is deliberately NOT copied. `npm ci --workspace=...`
# scopes which workspace's *scripts* run, not which dependencies are installed:
# with the web manifest present, npm installs its tree too and `npm prune`
# keeps it, because a workspace's own dependencies are not "dev". That put MUI,
# Recharts, Framer Motion and 58 MB of icon fonts inside the API image. Leaving
# the manifest out makes npm skip that workspace entirely.
RUN npm ci --workspace=@finance/api --include-workspace-root

COPY apps/api ./apps/api

# `copy-assets.mjs`, part of the API's own build, puts the i18n catalogues into
# dist -- without them a server built from this image answers every error in
# raw catalogue keys.
RUN npm run build --workspace=@finance/api

# Pruning rather than a second `npm ci --omit=dev`: that second install would
# hit the same `prepare` problem, this time with no TypeScript to run it.
#
# This does remove tsx, vitest, supertest, vite, pino-pretty and the type
# packages — verified in the built image, not assumed. What it keeps is
# `typescript` itself, a devDependency of the linked `@finance/schemas`
# workspace that npm evidently wants to keep buildable. Nothing in this image
# ever compiles anything, so 23 MB of compiler goes by hand.
RUN npm prune --omit=dev \
 && rm -rf node_modules/typescript \
 && mkdir -p apps/api/node_modules packages/schemas/node_modules

# ---- 2. runtime ------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

# The official images already ship an unprivileged `node` user; there is no
# reason to invent another one. Only the compiled output and the pruned
# dependency tree cross over -- no TypeScript, no test suite, no web client.
#
# **Both the root and the per-workspace `node_modules` have to come across.**
# npm hoists what it can and nests what it cannot, and it nested `i18next`
# under `apps/api/node_modules` — so copying only the root tree produced an
# image that built, passed every file-existence check, and then died on boot
# with `ERR_MODULE_NOT_FOUND: i18next`. The build stage `mkdir -p`s both so
# these COPYs cannot fail if a future npm hoists everything after all.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/packages/schemas/node_modules ./packages/schemas/node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/schemas/package.json ./packages/schemas/
COPY --from=build --chown=node:node /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

USER node
EXPOSE 4000

# Node 22 has fetch built in, so liveness costs no curl in the image. This
# probes the process itself, not its dependencies: /health/ready is the one that
# checks Postgres and Redis, and a container is not unhealthy merely because a
# database it does not own is having a moment.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Overridden by the worker and the migration job -- see docker-compose.yml.
CMD ["node", "apps/api/dist/server.js"]
