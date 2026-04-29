# Stratoscope UI — Vite + React + Tailwind production image
# Version: 0.2.0
# Serves static build via nginx on port 80.
# Build deps: Node 20 (multi-stage). Runtime deps: nginx + ksh, wget, curl, vim (standard tooling).
# Port: 80

FROM node:20-bookworm AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.26-bookworm

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ksh wget curl vim \
    && rm -rf /var/lib/apt/lists/*

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
