FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY apps/mini-app/package.json apps/mini-app/package.json
COPY apps/user-client/package.json apps/user-client/package.json

RUN npm ci

COPY apps/bot apps/bot
RUN npm run build -w @nastya-mes/bot
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/bot/package.json apps/bot/package.json
COPY --from=build /app/apps/bot/dist apps/bot/dist

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "@nastya-mes/bot"]
