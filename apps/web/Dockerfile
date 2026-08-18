# syntax=docker/dockerfile:1

# Serves the built client, and proxies `/api` to the API container.
#
# Build from the REPOSITORY ROOT, not from this directory:
#     docker build -f apps/web/Dockerfile -t finance-web .
# The client depends on the `@finance/schemas` workspace for every bound and
# value set its forms validate against, so the build context has to contain both
# packages — the same constraint `apps/api/Dockerfile` documents.
#
# The proxy is not a convenience. The refresh token is an HttpOnly cookie marked
# `SameSite=Lax`, which a browser does not send on a cross-site request, so the
# client and the API must share an origin or every session dies at the first
# token refresh. This container is that shared origin; `config/env.ts` refuses
# to start in production if the two base URLs disagree.

# ---- 1. build --------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# Manifests and the shared package first, so this layer stays cached until a
# dependency really changes. `packages/schemas` comes in whole because `npm ci`
# compiles it through its own `prepare` script, and `--ignore-scripts` does not
# prevent that -- a stage holding only its manifest fails with `TS5058`.
COPY package.json package-lock.json ./
COPY packages/schemas ./packages/schemas
COPY apps/web/package.json apps/web/

# `apps/api/package.json` is deliberately NOT copied, mirroring what the API's
# Dockerfile does with the web manifest: `--workspace` scopes which scripts run,
# not which dependencies are installed, so leaving the manifest out is what
# keeps the API's tree out of this build.
RUN npm ci --workspace=@finance/web --include-workspace-root

COPY apps/web ./apps/web

# A relative base URL, because this image is also the origin the API is reached
# through. Anything absolute here would reintroduce the cross-origin problem the
# proxy below exists to avoid.
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build --workspace=@finance/web

# ---- 2. runtime ------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Alpine is fine here, unlike the Postgres and Node images: this one is only
# ever built and run through Docker Desktop's own linux/amd64 runtime, and the
# entrypoint that broke under musl was Postgres's, not nginx's.

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# nginx's own image already handles signals and drops to an unprivileged worker;
# the master needs root to bind :80 inside the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
