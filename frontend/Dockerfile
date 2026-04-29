# Stratoscope UI — Vite + React + Tailwind production image
# Version: 0.2.1
# What it does: Multi-stage image — npm ci + vite build, then nginx serves dist on port 80 with gzip and asset caching.
# Dependencies: node:20-bookworm (build), nginx:1.26-bookworm (runtime); runtime installs ksh, wget, curl, vim after apt upgrade.
# Port: 80

FROM node:20-bookworm AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN npm run build \
    && test -f dist/index.html \
    && test -d dist/assets

FROM nginx:1.26-bookworm

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ksh wget curl vim ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Smoke-test binary exists (curl used for healthcheck)
RUN test -f /usr/share/nginx/html/index.html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
