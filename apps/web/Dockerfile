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

# Into `templates/`, not `conf.d/`: the nginx image's entrypoint runs
# `envsubst` over everything in that directory and writes the result to
# `conf.d/` before starting. The two variables below are what it substitutes.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Defaults that describe *this repository's* compose network, so
# `docker-compose.deploy.yml` sets neither variable and gets exactly the config
# it had before this was a template: the container named `api`, resolved by
# Docker's embedded DNS, which serves no AAAA records worth asking for.
#
# Override both together when the API lives somewhere else. On Fly, that is
#   API_UPSTREAM=http://finance-api.flycast:4000
#   NGINX_RESOLVER=[fdaa::3] valid=10s
# — `.flycast` because it is an app-wide address that survives a deploy, where
# `.internal` names individual machines that do not.
#
# NGINX_ENVSUBST_FILTER is a regex over variable *names*. It must stay pinned to
# these two: unfiltered, `envsubst` also eats `$host`, `$uri`, `$scheme` and
# `$remote_addr`, replacing each with an empty string. The config still parses.
ENV API_UPSTREAM="http://api:4000" \
    NGINX_RESOLVER="127.0.0.11 valid=10s ipv6=off" \
    NGINX_ENVSUBST_FILTER="^(API_UPSTREAM|NGINX_RESOLVER)$"

EXPOSE 80

# nginx's own image already handles signals and drops to an unprivileged worker;
# the master needs root to bind :80 inside the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
