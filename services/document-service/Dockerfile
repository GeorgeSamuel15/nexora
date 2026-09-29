# Development/verification image. Full Compose execution remains a release gate.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.19.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@nexora/document-service...

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.19.0
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build --chown=node:node /repo /repo
RUN mkdir -p /repo/services/document-service/storage/documents && chown -R node:node /repo/services/document-service/storage
RUN mkdir -p /event-outbox && chown node:node /event-outbox
USER node
CMD ["sh", "-c", "pnpm --filter @nexora/document-service prisma:deploy && node services/document-service/dist/index.js"]
