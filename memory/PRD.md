# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Modern movie & TV series database (IMDb/TMDB style, dark theme) with home, movie/series/actor detail pages, global search, admin panel with moderation (IP tracking, suspensions, per-field locking), custom granular roles, discussions, reports, edit history, user profiles, similar-content, leaderboard, TMDB-style edit pages, inline actor creation, auto-save on cast changes, drag-to-reorder cast.

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
- Cast dialog with inline actor creation
- Auto-save on cast changes
- **Drag-to-reorder cast** (new 2026-09-29)

## Changelog 2026-09-29
- Everything previously listed.
- **Drag-to-reorder cast**: On both `MovieEdit` and `SeriesEdit`, main cast rows are now `draggable`. Left grip handle icon, right position badge (#1, #2, …), highlighted border when dragging. Uses native HTML5 drag events (no new deps). On drop, `reorderCast(from, to)` computes the new list and calls `save(nextForm)` — reorder auto-saves.
- Fixed a hook-order violation by moving new `useState(dragIdx)` above the early-return guard.

## Backlog (P1/P2)
- P1: Drag-to-reorder for crew, creators, and season/episode lists
- P1: Actor detail redesign (parity)
- P1: TV Series reviews (unlock TV Score on user profile)
- P1: Browse filters (genre, year, rating)
- P1: Forgot-password / email reset
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
