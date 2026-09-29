# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Build a modern movie database web app (IMDb/TMDB style, dark mode) with Home, Movie Detail, Actor Detail, global search, and admin panel. Extended with TV Series, custom roles, moderation (IP tracking, suspensions, field locking), discussions, reports, edit history, image galleries, user profiles (edit + password), similar-content, leaderboard, TMDB-style movie detail page, TMDB-style user profile page, TMDB-style movie edit page, and inline actor creation from the cast dialog.

## Tech Stack
- Backend: FastAPI + MongoDB (`server.py` monolith, PyObjectId models)
- Frontend: React + Tailwind + Shadcn UI
- Auth: JWT cookie-based (httpOnly, SameSite=None), bcrypt password hashing

## Implemented (highlights)
- Full auth incl. profile edit + password change
- Movies, TV Series, Actors — full CRUD; granular custom roles
- Admin panel with Users/Roles/IP Overlap/Movies/Series/Actors tabs and custom-role assign
- Moderation: IP tracking, suspensions (hidden from public), field locking with per-field padlocks
- Discussions, forum threads, Report a Problem
- Edit history with field diffs + revert (mod/admin)
- Cross-type similar content
- TMDB-style pages: Movie Detail, User Profile, Movie Edit
- Cast Edit dialog with typeahead + inline actor creation

## Changelog 2026-09-29
- All above.
- **Cast dialog redesign**: new `CastEditDialog` component. Person field is a typeahead searching existing actors (suggestions list with avatars). When the query has no exact match, a green "Create new actor" option appears — clicking it calls `POST /actors` inline, then auto-selects the freshly created actor. Character input + Cancel/Save footer in cyan. Wired into `MovieEdit.jsx`: cast rows now show as cards with an "Edit" button that opens the dialog, "Add cast" opens it with an empty state, remove is a small X icon.

## Backlog (P1/P2)
- P1: TV Series & Actor detail redesigns
- P1: Series edit page with same TMDB-style layout, plus its own cast dialog
- P1: Browse filters (genre, year, rating)
- P1: Forgot-password / email reset flow
- P2: Series reviews to power TV Score
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
