# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
RUN npm ci || npm install

COPY apps/api ./apps/api
RUN npm run build --workspace=@finance/api

# ---- runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --omit=dev || npm install --omit=dev

COPY --from=build /app/apps/api/dist ./dist

RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 4000
CMD ["node", "dist/server.js"]
