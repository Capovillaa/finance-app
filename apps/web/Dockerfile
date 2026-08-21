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

# "Sign in with Google", and the one piece of configuration that cannot be
# supplied at run time: Vite substitutes `import.meta.env.*` into the bundle
# during the build, so this has to arrive as a build argument rather than as a
# container environment variable. Empty by default, which is what makes the
# feature optional — the client renders no button without it, and the API
# refuses `/auth/google` without its own matching `GOOGLE_CLIENT_ID`.
#
# It is not a secret: the browser hands it to Google to obtain a token at all.
# The authorized JavaScript origin configured for it in Google Cloud Console
# must equal the URL this image is served from.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

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
# Sourced by the image's entrypoint before the envsubst step, and numbered 16 so
# it lands there: it resolves `NGINX_RESOLVER=auto` and a schemeless
# `API_UPSTREAM` into real values. See the file's own header.
#
# The `chmod` is not decoration. nginx's entrypoint sources a `.envsh` only
# `if [ -x "$f" ]`, and otherwise logs `Ignoring …, not executable` and carries
# on — so a checkout that did not preserve the exec bit produces an image that
# builds, starts, passes `nginx -t`, and quietly proxies to the compose default
# on a platform where that name resolves to nothing. Setting it here makes the
# image independent of how the repository was checked out.
COPY apps/web/docker-entrypoint.d/16-upstream-and-resolver.envsh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/16-upstream-and-resolver.envsh
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
