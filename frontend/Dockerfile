# ---------- build stage ----------
# Node 24 LTS. vite accepts ^20.19 || >=22.12, but vitest 5 and jsdom 30 exclude
# odd-numbered (non-LTS) Node releases, so the LTS line is what this project
# supports on both sides.
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, so editing source does not invalidate the npm layer.
# `npm ci` rather than `npm install`: the committed lockfile is authoritative,
# which makes the image reproducible.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- serve stage ----------
# The unprivileged nginx image listens on 8080 and runs as a non-root user, so
# the container needs neither root nor write capabilities.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS serve

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --output-document=/dev/null http://127.0.0.1:8080/ || exit 1

# The base image already sets `USER nginx`; no CMD needed from the default.
