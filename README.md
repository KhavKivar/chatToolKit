# Twitch Content Toolkit

A full-stack workspace for collecting, searching, classifying, and reviewing Twitch VOD conversations and derived clips. The project combines a Django REST backend, background processing commands, and a Next.js analytics interface.

## Highlights

- Twitch VOD and comment ingestion
- Search across chat messages and transcript segments
- Streamer, video, clip, and task management
- Toxicity classification and aggregate statistics
- Server-sent event progress updates for long-running scrapes
- Responsive Next.js dashboard with Redux state management

## Architecture

```text
app/          Next.js 16 dashboard
core/         Django project configuration
scraper/      Models, API views, serializers, and worker commands
streamladder/ Optional clip-processing integrations
```

Generated exports, browser sessions, downloaded media, deployment addresses, and credentials are intentionally excluded from the repository.

## Backend setup

Requirements: Python 3.12+.

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

The API starts on `http://localhost:8000` and uses SQLite by default.

## Frontend setup

Requirements: Node.js 20+ and pnpm.

```bash
cd app
pnpm install
cp .env.example .env.local
pnpm dev
```

Set `NEXT_PUBLIC_API_BASE_URL` when the API is hosted somewhere other than `http://localhost:8000/api`.

## Validation

```bash
python manage.py check
cd app && pnpm lint && pnpm build
```

Only use Twitch and third-party APIs in accordance with their terms and with data you are authorized to process.
