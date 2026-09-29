# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Build a modern movie database web app (IMDb/TMDB style, dark mode) with Home, Movie Detail, Actor Detail, global search, and admin panel. Extended with TV Series (seasons/episodes/guest stars), granular custom roles, moderation (IP tracking, suspensions, field locking), discussions, reports, edit history, image galleries, user profiles, similar-content suggestions, leaderboard, and TMDB-style movie detail page.

## Tech Stack
- Backend: FastAPI + MongoDB (`server.py` monolith, PyObjectId models)
- Frontend: React + Tailwind + Shadcn UI (dark theme)
- Auth: JWT cookie-based (httpOnly, SameSite=None)

## Implemented
- Auth (register/login/me/logout), custom roles with granular permissions
- Movies, TV Series (seasons/episodes/guest stars), Actors — full CRUD
- Admin panel: Users, Roles, IP Overlap, Movies, Series, Actors tabs + custom-role assign UI
- Moderation: IP tracking, account suspensions (hidden from public), field locking
- Discussions, forum threads, Report a Problem
- Edit history with field diffs; **revert** for moderator/admin on movie/series/actor updates
- Cross-type similar content (movies + series) scored by genres, cast, and release-year proximity
- Image galleries, leaderboard; suspended users hidden from public
- **TMDB-style Movie Detail page** (2026-09-29)

## Changelog 2026-09-29
- IP Overlap: fixed missing `Link` import.
- Related content endpoints now return mixed movies + series scored by genre/cast/year.
- Edit revert: raw before/after stored in log; `POST /api/edits/{id}/revert`; UI Revert button.
- Custom-role assignment UI added to Admin Users list.
- Movie detail page redesigned (TMDB style):
  - New Movie fields: `tagline`, `status`, `original_language`, `budget`, `revenue`, `awards_wins`, `awards_nominations`, `keywords`, `crew`, `video_urls`.
  - Movie form updated with all new fields.
  - View tracking: `movie_views` collection increments on each `GET /movies/{id}`.
  - New `GET /movies/{id}/stats` → 7-day trend, top contributors (from edits), content_score (% of key fields filled).
  - Hero: backdrop + poster overlay, User Score circle, action row, tagline, Overview, Director/Writer credits.
  - Awards strip when wins/nominations set.
  - Top Billed Cast horizontal scroll.
  - Social tabs (Reviews / Discussions embedded).
  - Media tabs (Backdrops / Posters).
  - Sidebar: Watch Trailer, Status/Language/Budget/Revenue card, Keywords pills, Content Score bar, Top Contributors, View Edit History anchor, Popularity Trend sparkline, Edit Page, Report Issue.

## Backlog (P1/P2)
- P1: Apply the same TMDB-style layout to TV Series and Actor detail pages
- P1: Watchlist & Favorites end-to-end verification (favorite button currently reuses watchlist toggle)
- P1: Advanced filtering/sorting on Browse (genre, year, rating)
- P2: Series stats endpoint parity (views, contributors, content_score)
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
