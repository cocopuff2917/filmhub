# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Modern movie & TV series database (IMDb/TMDB style, dark theme) with home, movie/series/actor detail pages, global search, admin panel with moderation (IP tracking, suspensions, per-field locking), custom granular roles, discussions, reports, edit history, user profiles, similar-content, leaderboard, TMDB-style edit pages, inline actor creation, and auto-save on cast changes.

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
- TMDB-style pages: Movie Detail, Movie Edit, User Profile, Series Detail (expandable seasons + episodes), Series Edit (per-episode guest star editor)
- Cast dialog with inline actor creation — reused for main cast AND per-episode guest stars
- **Auto-save on cast changes** (new 2026-09-29)

## Changelog 2026-09-29
- Everything previously listed.
- **Auto-save on cast dialog submit**: `MovieEdit.handleCastSave`, `SeriesEdit.handleCastSave`, and `SeriesEdit.handleGuestSave` now compute the next form synchronously (outside the `setForm` callback) and immediately call `save(nextForm)`. The refactored `save()` accepts an optional form override so the PATCH uses the just-updated cast without waiting for React state to flush.
- Result: adding/updating a cast member or guest star fires "Changes saved" instantly — no need to click the top Save button afterward.

## Backlog (P1/P2)
- P1: Actor detail redesign (parity)
- P1: TV Series reviews (unlock TV Score on user profile)
- P1: Browse filters (genre, year, rating)
- P1: Forgot-password / email reset
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
