# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Build a modern movie database web app (IMDb/TMDB style, dark mode) with Home, Movie Detail, Actor Detail, global search, and admin panel. Extended with TV Series (seasons/episodes/guest stars), granular custom roles, moderation (IP tracking, suspensions, field locking), discussions, reports, edit history, image galleries, user profiles, similar-content suggestions, leaderboard.

## Tech Stack
- Backend: FastAPI + MongoDB (`server.py` monolith, PyObjectId models)
- Frontend: React + Tailwind + Shadcn UI (dark theme)
- Auth: JWT cookie-based (httpOnly, SameSite=None)

## Implemented
- Auth (register/login/me/logout), custom roles with granular permissions
- Movies, TV Series (seasons/episodes/guest stars), Actors — full CRUD
- Admin panel: Users, Roles, IP Overlap, Movies, Series, Actors tabs
- Moderation: IP tracking, account suspensions (hidden from public), field locking
- Discussions, forum threads, Report a Problem
- Edit history with field diffs, image galleries, similar content, leaderboard
- Suspended users hidden from public profile & leaderboard

## Fixed 2026-09-29
- IP Overlap tab crashed with "Link is not defined" — added missing `Link` import in `Admin.jsx`.

## Backlog (P1/P2)
- P1: Watchlist & Favorites end-to-end verification
- P1: Advanced filtering/sorting on Browse (genre, year, rating)
- P2: Actor `place_of_birth` / `place_of_death` fields + UI
- P2: Refactor `server.py` into APIRouter modules once it exceeds current size

## Credentials
- Admin: admin@cineverse.com / Admin@123
