# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY . .
ARG BUILD_VERSION=dev
ARG BUILD_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV NODE_ENV=production
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG BUILD_VERSION=dev
ARG BUILD_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV PORT=3000
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev
COPY --from=build /app/dist ./dist
RUN chown -R node:node /app
USER node
LABEL org.opencontainers.image.source="https://github.com/hgnc/pgnc-external-stack" \
	org.opencontainers.image.title="solr-client" \
	org.opencontainers.image.version="${BUILD_VERSION}" \
	org.opencontainers.image.revision="${BUILD_COMMIT}" \
	org.opencontainers.image.created="${BUILD_DATE}"
EXPOSE 3000
CMD ["node", "dist/main"]
FROM node:20-alpine

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3000

CMD ["npm", "run", "start:prod"]