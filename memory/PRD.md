# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Build a modern movie database web app (IMDb/TMDB style, dark mode) with Home, Movie Detail, Actor Detail, global search, and admin panel. Extended with TV Series (seasons/episodes/guest stars), granular custom roles, moderation (IP tracking, suspensions, field locking), discussions, reports, edit history, image galleries, user profiles (edit + password), similar-content suggestions, leaderboard, TMDB-style movie detail page, TMDB-style user profile page, and TMDB-style movie edit page.

## Tech Stack
- Backend: FastAPI + MongoDB (`server.py` monolith, PyObjectId models)
- Frontend: React + Tailwind + Shadcn UI
- Auth: JWT cookie-based (httpOnly, SameSite=None), bcrypt password hashing

## Implemented
- Auth: register / login / me / logout / change password / update username & bio / update avatar
- Custom roles with granular permissions (admin can assign)
- Movies, TV Series, Actors — full CRUD
- Admin panel: Users, Roles, IP Overlap, Movies, Series, Actors
- Moderation: IP tracking, suspensions, field locking
- Discussions, forum threads, Report a Problem
- Edit history + revert
- Cross-type similar content
- TMDB-style Movie Detail page
- TMDB-style User Profile page
- **TMDB-style Movie Edit page** (`/movie/:id/edit`) — 2026-09-29

## Changelog 2026-09-29
- Fixed IP Overlap Link import.
- Cross-type related endpoints.
- Edit revert + custom-role assign UI.
- Movie detail redesign + new fields + view tracking + stats.
- User profile redesign + Edit Profile dialog with password change.
- **Movie edit redesign**:
  - New route `/movie/:id/edit` renders `MovieEdit.jsx`.
  - Left sticky sidebar: cyan Edit header, scroll-spy anchor nav (Primary Facts, Cast, Crew, Genres, Keywords, Taglines, Videos, Images), Content Score card, Keyboard Shortcuts hint (Ctrl+S saves).
  - Right form: light surface, grouped sections with two-column layouts, per-field lock icons (padlock next to each label, click to toggle for mods, wired to `PATCH /movies/{id}/lock`). Non-mods can't edit locked fields — indicator is read-only for them.
  - ChipInput for genres, keywords, video URLs. Full Cast/Crew editing.
  - Save via `PATCH /movies/{id}` from top bar or bottom of the form, Ctrl+S shortcut.
  - `MovieDetail.jsx` Edit buttons now navigate to this page instead of opening the modal dialog.

## Backlog (P1/P2)
- P1: TV Series & Actor detail redesigns (parity)
- P1: Similar edit-page redesign for Series & Actors
- P1: Browse filters (genre, year, rating)
- P1: Forgot-password / email reset flow
- P2: Series reviews (unlocks TV Score)
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
