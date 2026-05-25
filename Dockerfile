FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM base AS release
COPY scripts/install-curl-impersonate.sh /app/
RUN apk add --no-cache git ca-certificates su-exec curl bash \
  && chmod +x /app/install-curl-impersonate.sh \
  && /app/install-curl-impersonate.sh \
  && rm /app/install-curl-impersonate.sh

COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DEGOOG_PORT=4444
EXPOSE 4444

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${DEGOOG_PORT:-4444}/readyz"

ENTRYPOINT ["/entrypoint.sh"]
