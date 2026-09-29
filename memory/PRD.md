# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Build a modern movie database web app (IMDb/TMDB style, dark mode) with Home, Movie Detail, Actor Detail, global search, and admin panel. Extended with TV Series (seasons/episodes/guest stars), granular custom roles, moderation (IP tracking, suspensions, field locking), discussions, reports, edit history, image galleries, user profiles (with edit + password change), similar-content suggestions, leaderboard, TMDB-style movie detail page, and TMDB-style user profile page.

## Tech Stack
- Backend: FastAPI + MongoDB (`server.py` monolith, PyObjectId models)
- Frontend: React + Tailwind + Shadcn UI
- Auth: JWT cookie-based (httpOnly, SameSite=None), bcrypt password hashing

## Implemented
- Auth: register / login / me / logout / **change password** / **update username & bio** / update avatar
- Custom roles with granular permissions (admin can assign)
- Movies, TV Series (seasons/episodes/guest stars), Actors — full CRUD
- Admin panel: Users (role & custom-role assign), Roles, IP Overlap, Movies, Series, Actors
- Moderation: IP tracking, account suspensions (hidden publicly), field locking
- Discussions, forum threads, Report a Problem
- Edit history with field diffs + revert (mod/admin)
- Cross-type similar content (movies + series) scored by genres/cast/year
- Image galleries, leaderboard
- TMDB-style Movie Detail page (stats, contributors, content score, popularity trend)
- TMDB-style User Profile page (rating histogram, top genres, recent activity, 30-day stacked area chart, **Edit Profile dialog with password change**)

## Changelog 2026-09-29
- Fixed IP Overlap Link import.
- Cross-type related endpoints.
- Edit revert + custom-role assign UI.
- Movie detail redesign + new fields + view tracking + stats.
- User profile redesign (dark hero, tabs, stats, charts).
- **Profile self-service**: `PATCH /auth/me` (name, bio), `POST /auth/me/password` (bcrypt verify + rotate). `EditProfileDialog` component with Profile / Password tabs and confirm-password field. Bio rendered under score circles on the profile.

## Backlog (P1/P2)
- P1: TV Series & Actor detail redesign (TMDB parity)
- P1: Browse filters (genre, year, rating)
- P1: Forgot-password / reset email flow (currently only in-app change)
- P2: TV Series reviews to power `avg_series_rating`
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
