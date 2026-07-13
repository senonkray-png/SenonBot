FROM oven/bun:1 AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY apps/mini-app/package.json apps/mini-app/package.json
COPY apps/user-client/package.json apps/user-client/package.json

RUN bun install --production

COPY apps/user-client apps/user-client

CMD ["bun", "apps/user-client/src/index.ts"]
