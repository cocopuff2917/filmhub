# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Build a modern movie database web app (IMDb/TMDB style, dark mode) with Home, Movie Detail, Actor Detail, TV Series Detail, global search, and admin panel. Extended with TV Series (seasons/episodes/guest stars), custom roles, moderation (IP tracking, suspensions, field locking), discussions, reports, edit history, image galleries, user profiles (edit + password), similar-content, leaderboard, TMDB-style pages, and inline actor creation from the cast dialog.

## Tech Stack
- Backend: FastAPI + MongoDB (`server.py` monolith, PyObjectId models)
- Frontend: React + Tailwind + Shadcn UI
- Auth: JWT cookie-based, bcrypt

## Implemented (highlights)
- Full auth incl. profile edit + password change
- Movies, TV Series, Actors — full CRUD; granular custom roles
- Admin panel with role & custom-role assign
- Moderation: IP tracking, suspensions, field locking with per-field padlocks
- Discussions, forum threads, Report a Problem
- Edit history + revert
- Cross-type similar content
- **TMDB-style pages**: Movie Detail, Movie Edit, User Profile, **Series Detail** (new 2026-09-29)
- Cast Edit dialog with typeahead + inline actor creation

## Changelog 2026-09-29
- All previously listed features.
- **Series detail redesign** (TMDB style):
  - New series fields: `tagline`, `keywords`, `network`, `network_logo_url`, `type`, `original_language`, `awards_wins`, `awards_nominations`, `creators` (list), `video_urls`.
  - View tracking (`series_views` collection) on every `GET /series/{id}`.
  - New `GET /series/{id}/stats` → 7-day trend, top contributors, content_score.
  - Hero with backdrop + poster overlay, ENDED/RUNNING badge, season/episode count, User Score circle, watchlist/favorite/share/trailer buttons, tagline, Overview, Creators chips, mod actions.
  - Awards strip; Series Cast horizontal scroll; Current Season card + All Seasons grid.
  - Social tab (Discussions embedded); Media tabs (Backdrops / Posters).
  - Sidebar: Watch Trailer, Status / Network (with logo) / Type / Original Language card, Keywords pills, Content Score bar, Top Contributors + View Edit History, Popularity Trend sparkline, Edit Page / Report Issue.

## Backlog (P1/P2)
- P1: Actor detail redesign (parity)
- P1: Series edit page with TMDB-style layout (matching MovieEdit)
- P1: Series reviews (unlock TV Score on user profile)
- P1: Browse filters
- P1: Forgot-password / email reset
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
