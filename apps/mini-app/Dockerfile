FROM node:22-alpine AS build

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY apps/mini-app/package.json apps/mini-app/package.json
COPY apps/user-client/package.json apps/user-client/package.json

RUN npm ci

COPY apps/mini-app apps/mini-app
RUN npm run build -w @nastya-mes/mini-app

FROM nginx:1.27-alpine AS runtime

COPY apps/mini-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/mini-app/dist /usr/share/nginx/html

EXPOSE 80
