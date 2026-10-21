# The web client, built and served by Caddy with deploy/Caddyfile.
# Base images are pinned by digest, as in latihanAPI: a tag can be
# re-pointed, a digest cannot.

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Exactly the locked versions; no install scripts run.
RUN npm ci --ignore-scripts
COPY . .
# Type-checks, then builds to /app/dist. src/api/schema.d.ts is committed,
# so the build does not need the API's contract.
RUN npm run build

FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/web
