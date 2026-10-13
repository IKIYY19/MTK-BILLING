FROM node:24-bookworm-slim

ARG VITE_API_URL=/api
ARG VITE_GOOGLE_CLIENT_ID

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/mikrotik-billing/package.json artifacts/mikrotik-billing/package.json
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY scripts/package.json scripts/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN PORT=4173 BASE_PATH=/ pnpm --filter @workspace/mikrotik-billing run build
RUN mkdir -p public && cp -R artifacts/mikrotik-billing/dist/public/. public/

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "artifacts/api-server/src/index.js"]
