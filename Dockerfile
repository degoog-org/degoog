FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build:css

FROM base AS release
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json

ENV PORT=4444
EXPOSE 4444

USER bun
ENTRYPOINT ["bun", "run", "src/server.ts"]
