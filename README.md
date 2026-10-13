# Filmhub 🎬

A full-stack film review and community platform. Users can browse films, write reviews, rate them, and discuss with others.

## Stack
- **Frontend:** React 18 + Vite + React Router
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Deployment:** Railway

## Local Development

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Set environment variables
cp .env.example .env
# Fill in DATABASE_URL, PORT, etc.

# Run both frontend and backend
npm run dev
```

## Deployment

This repo auto-deploys to Railway on every push to `main` via GitHub Actions.

Set these environment variables in Railway:
- `DATABASE_URL` — PostgreSQL connection string (Railway provides this automatically)
- `NODE_ENV=production`
- `PORT` — Railway injects this automatically
