# syntax=docker/dockerfile:1

FROM node:22.23.1-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/nemlig-assistant/package.json apps/nemlig-assistant/package.json
RUN pnpm install --frozen-lockfile --filter nemlig-assistant...

COPY apps/nemlig-assistant apps/nemlig-assistant
RUN pnpm --filter nemlig-assistant build \
  && pnpm --filter nemlig-assistant deploy --prod /app

FROM node:22.23.1-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gh \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEMLIG_MCP_HTTP_HOST=0.0.0.0
ENV NEMLIG_MCP_HTTP_PORT=8080
WORKDIR /app

COPY --from=build --chown=node:node /app ./

USER node
EXPOSE 8080
CMD ["node", "dist/http.js"]
