# MSME-360 Docker Deployment

## Prerequisites
- Docker + Docker Compose v2 installed on your host
- MongoDB Atlas cluster (or compatible MongoDB URI)
- Google Cloud / Meta developer credentials for integrations (see `.env.example`)

## Build & Start

```bash
# From the project root
docker compose build          # build both images
docker compose up -d          # start both containers detached
```

## Commands

| Action | Command |
|---|---|
| View logs (backend) | `docker compose logs -f backend` |
| View logs (frontend) | `docker compose logs -f frontend` |
| Stop | `docker compose down` |
| Restart | `docker compose restart` |
| Rebuild & restart | `docker compose up -d --build` |
| Shell into backend | `docker compose exec backend sh` |
| Shell into frontend | `docker compose exec frontend sh` |

## Environment Variables

Copy `.env.example` to `.env` and set real values:

```bash
cp backend/.env.example .env
# Edit .env with your values
```

Required vars (in `backend/.env` and `compose`):

```
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/msme360
JWT_SECRET=your_super_secret_jwt_key
PORT=5001                      # overrides compose default if set
FRONTEND_URL=http://localhost:5173
GROQ_API_KEY=gsk_...
INTEGRATION_ENCRYPTION_KEY=replace-with-64-hex-characters

# Gmail (optional if using manual sync only)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5001/api/webhook/gmail/auth/callback
GOOGLE_PUBSUB_TOPIC=...
GOOGLE_PUBSUB_AUDIENCE=...

# Meta (optional — app will start without them)
META_APP_ID=...
META_APP_SECRET=...
META_VERIFY_TOKEN=...
META_OAUTH_REDIRECT_URI=http://localhost:5001/api/integrations/meta/callback
```

## Service notes

- **Backend**: Express server listens on `0.0.0.0:${PORT}`. Health endpoint: `GET /health` returns JSON.
- **Frontend**: Vite dev server on port 5173 (default) in dev; production build served from `dist/` in prod.
- **MongoDB**: No container started — use your existing Atlas URI via `MONGO_URI`. Do not add a local MongoDB container unless genuinely required.
- **Ports**: `5001` (backend API) and `5173` (frontend Vite dev) are exposed. Adjust in `docker-compose.yml` if conflicts.

## Development

```bash
# Rebuild only on source change (uses nodemon equivalent via node --watch in compose)
docker compose up

# Or run individual services manually:
#   docker compose up backend   # API only
#   docker compose up frontend  # UI only
```