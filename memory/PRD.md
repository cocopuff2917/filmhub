# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Modern movie & TV series database (IMDb/TMDB style, dark theme) with home, movie/series/actor detail pages, global search, admin panel with moderation (IP tracking, suspensions, per-field locking), custom granular roles, discussions, reports, edit history, user profiles, similar-content, leaderboard, TMDB-style edit pages, inline actor creation.

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind + Shadcn UI
- Auth: JWT cookie-based, bcrypt

## Implemented (highlights)
- Full auth with profile edit + password change
- Movies, TV Series (seasons/episodes/guest stars), Actors — full CRUD
- Admin panel with granular custom roles, IP overlap detection, suspensions, field-level locks
- Discussions, forum threads, reports
- Edit history + revert
- Cross-type similar content
- TMDB-style pages: Movie Detail, Movie Edit, User Profile, Series Detail (with expandable seasons + episodes), Series Edit
- Cast dialog with inline actor creation
- **Guest stars rendered per episode** (new 2026-09-29)

## Changelog 2026-09-29
- All previously listed features.
- **Guest stars display**: Under each episode in the expandable season blocks, show a "Guest Stars" heading followed by pill-shaped chips containing the actor's avatar, name, and "as Character". Each chip links to the actor detail page. Backend already enriches `guest_stars` with actor data via `enrich_series(deep=True)` — this change only improves the UI rendering.

## Backlog (P1/P2)
- P1: Per-episode "Add guest star" button inside SeriesEdit reusing CastEditDialog
- P1: Actor detail redesign (parity)
- P1: TV Series reviews (unlock TV Score on user profile)
- P1: Browse filters (genre, year, rating)
- P1: Forgot-password / email reset
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
