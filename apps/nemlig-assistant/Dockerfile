# syntax=docker/dockerfile:1

FROM node:24.13.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/nemlig-assistant/package.json apps/nemlig-assistant/package.json
RUN pnpm install --frozen-lockfile --filter nemlig-assistant...

COPY apps/nemlig-assistant apps/nemlig-assistant
ARG JOURNEY_BUILD=0
RUN NEMLIG_BUILD_JOURNEY=$JOURNEY_BUILD pnpm --filter nemlig-assistant build \
  && NEMLIG_BUILD_JOURNEY=$JOURNEY_BUILD pnpm --filter nemlig-assistant deploy --prod /app

FROM node:24.13.0-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG JOURNEY_IMAGE_REVISION
ENV NEMLIG_JOURNEY_IMAGE_REVISION=$JOURNEY_IMAGE_REVISION
ENV NODE_ENV=production
ENV NEMLIG_MCP_HTTP_HOST=0.0.0.0
ENV NEMLIG_MCP_HTTP_PORT=8080
WORKDIR /app

COPY --from=build --chown=node:node /app ./

USER node
EXPOSE 8080
CMD ["node", "dist/http.js"]
