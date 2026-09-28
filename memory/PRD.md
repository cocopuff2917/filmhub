# CineVerse — Movie Database

## Original Problem
Build a movie database web app: hero + search, Trending & Recently Added grids, Movie Detail page (title, release, rating, genres, synopsis, Cast & Crew, media gallery), Actor Detail page with filmography, dark IMDb/TMDB aesthetic.

## User Choices
- Empty DB with admin panel (no seeds)
- IMDb/TMDB style dark UI, warm amber accents
- Auth for rating/reviews
- Watchlist + Filter/sort included

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT httpOnly cookies, bcrypt, Emergent Object Storage
- Frontend: React 19 + react-router, shadcn/ui, Tailwind, sonner
- Admin auto-seeded from ADMIN_EMAIL/ADMIN_PASSWORD

## Implemented (2026-02-28)
- Auth: register, login, logout, /me with cookie sessions
- Movies CRUD (admin), search (title/genre/actor), filter (genre/year/sort), trending, recent, genres list
- Actors CRUD (admin), actor detail with linked filmography (character names shown)
- Reviews (upsert per user/movie), avg_rating aggregation
- Watchlist add/remove/list
- Image upload via Emergent Object Storage → /api/files/{path}
- Admin panel UI with poster/headshot upload, cast picker
- Pages: Home, Browse, MovieDetail, ActorDetail, Login, Register, Watchlist, Admin
- Actor page shows Born date + computed age

## Backlog
- P1: Nested review edit/delete UI; reply/thread
- P1: TMDB import-by-ID helper for admin
- P2: Real trailer embed (YouTube iframe)
- P2: Bulk poster upload / drag&drop
- P2: Public user profile page

## Credentials
See /app/memory/test_credentials.md
