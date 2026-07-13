# Deploy

Проект состоит из трех runtime-частей:

- `bot-api` - Telegram Bot API + Express API для Mini App.
- `user-client` - GramJS userbot worker, который слушает личный Telegram-аккаунт.
- `mini-app` - статический React/Vite Telegram Mini App.

## 1. Railway Postgres

В Railway открой сервис `Postgres` -> `Console` или подключись через `psql`
и выполни:

```sql
-- см. database/schema.sql
```

Файл схемы: `database/schema.sql`.

Для сервисов `bot-api` и `user-client` нужна переменная `DATABASE_URL`.
В Railway она берется из Postgres service -> `Variables` или через reference
к Postgres-сервису.

## 2. Environment

На сервере создай `.env` из шаблона:

```bash
cp .env.production.example .env
```

Заполни:

```env
BOT_TOKEN=...
DUMP_CHANNEL_ID=-100...
API_PORT=3001
CORS_ORIGIN=https://your-mini-app.example.com

TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
TELEGRAM_SESSION=...

DATABASE_URL=postgresql://postgres:password@host:5432/railway
DATABASE_SSL=false

S3_BUCKET=...
S3_ENDPOINT=...
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true

VITE_API_BASE_URL=https://your-api.example.com
```

`TELEGRAM_SESSION` генерируется один раз локально или на сервере:

```bash
npm run auth
```

Скрипт покажет QR-код, после сканирования сам запишет session в `.env`.

## 3. Docker Deploy

Сборка и запуск всех сервисов:

```bash
docker compose up -d --build
```

Логи:

```bash
docker compose logs -f bot-api
docker compose logs -f user-client
docker compose logs -f mini-app
```

Перезапуск:

```bash
docker compose restart
```

Healthcheck API:

```bash
curl http://localhost:3001/health
```

## 4. Deploy Without Docker

Установить зависимости и собрать:

```bash
npm ci
npm run build
```

Запустить API/бот:

```bash
NODE_ENV=production npm run start:bot
```

Запустить GramJS worker:

```bash
NODE_ENV=production npm run start:user
```

Mini App после сборки лежит в:

```txt
apps/mini-app/dist
```

Его можно отдать через nginx, Caddy, Cloudflare Pages, Netlify или любой static hosting.

## 5. Telegram Setup

Bot:

- Добавь бота в `DUMP_CHANNEL_ID`.
- Дай боту право публиковать сообщения в dump channel.
- Для Mini App укажи HTTPS URL фронтенда в BotFather.

Userbot:

- `TELEGRAM_SESSION` должен принадлежать аккаунту, чьи чаты нужно слушать.
- Не запускай два `user-client` с одной session одновременно на разных серверах.

## 6. Production URLs

Для Telegram Mini App нужен HTTPS.

Пример:

```txt
API:      https://api.example.com
Mini App: https://app.example.com
```

Тогда:

```env
VITE_API_BASE_URL=https://api.example.com
CORS_ORIGIN=https://app.example.com
```

После изменения `VITE_API_BASE_URL` нужно пересобрать Mini App.

## Railway Deploy

Railway-сервис из корня репозитория по умолчанию деплоит `bot-api`.
Для него используется [railway.json](railway.json):

```txt
Build: npm run build:bot
Start: npm run start:bot
Healthcheck: /health
```

Переменные для `bot-api`:

```env
BOT_TOKEN=...
DUMP_CHANNEL_ID=-100...
BOT_POLLING_ENABLED=true
CORS_ORIGIN=https://your-mini-app.up.railway.app
DATABASE_URL=...
DATABASE_SSL=false
S3_BUCKET=...
S3_ENDPOINT=...
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
```

`API_PORT` на Railway не задавай: приложение слушает стандартный Railway `PORT`.

Если Railway показывает `409: Conflict: terminated by other getUpdates request`,
значит этот же `BOT_TOKEN` запущен в другом процессе. На время диагностики можно
поставить:

```env
BOT_POLLING_ENABLED=false
```

API останется онлайн, но обычный bot polling будет выключен. Для полного
включения бота нужно остановить все другие экземпляры или перевыпустить токен
в BotFather.

Для `user-client` создай отдельный Railway service из того же GitHub repo и в Settings укажи:

```txt
Custom Config File: /railway.user-client.json
```

Этот сервис запускается через `apps/user-client/Dockerfile`, потому что медиа
загружается в Railway Bucket через `Bun.s3`.

Переменные для `user-client`:

```env
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
TELEGRAM_SESSION=...
DUMP_CHANNEL_ID=-100...
DATABASE_URL=...
DATABASE_SSL=false
S3_BUCKET=...
S3_ENDPOINT=...
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

`S3_*` возьми из Railway Bucket service: открой bucket `СМИ` -> `Variables`
или `Connect`, скопируй bucket name, endpoint, access key и secret key. Эти
переменные нужны одновременно в `@nastya-mes/user-client` для загрузки файлов
и в `@nastya-mes/bot` для выдачи временных ссылок Mini App.

Для `mini-app` создай третий Railway service и в Settings укажи:

```txt
Custom Config File: /railway.mini-app.json
```

Переменные для `mini-app`:

```env
VITE_API_BASE_URL=https://your-bot-api.up.railway.app
```

После создания public domain для Mini App вернись в `bot-api` и выставь:

```env
CORS_ORIGIN=https://your-mini-app.up.railway.app
```

## 7. Preflight

Перед деплоем:

```bash
npm run check:env
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

`check:env` проверяет только наличие и формат переменных, сами секреты не печатает.
