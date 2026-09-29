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
- TMDB-style pages: Movie Detail, Movie Edit, User Profile, Series Detail (expandable seasons + episodes), Series Edit (with per-episode guest star editor)
- Cast dialog with inline actor creation — reused for main cast AND per-episode guest stars

## Changelog 2026-09-29
- Everything previously listed.
- **Per-episode guest star editor** in SeriesEdit:
  - Each expanded episode now has a "Guest Stars (N)" panel with an "Add guest star" button.
  - Button opens the existing `CastEditDialog` (typeahead + inline actor creation).
  - Chips show actor avatar + name; click to edit, X to remove.
  - Save maps `title → name` for the backend `EpisodeItem` schema and keeps guest stars nested inside their episodes.
- Fixed the schema mismatch where the frontend used `ep.title` but the backend model stores `ep.name`. Now the edit form maps both directions and the detail page falls back to `ep.name`.

## Backlog (P1/P2)
- P1: Actor detail redesign (parity)
- P1: TV Series reviews (unlock TV Score on user profile)
- P1: Browse filters (genre, year, rating)
- P1: Forgot-password / email reset
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
