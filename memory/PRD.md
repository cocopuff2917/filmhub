# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Build a modern movie database web app (IMDb/TMDB style, dark mode) with Home, Movie Detail, Actor Detail, TV Series Detail, global search, and admin panel. Extended with TV Series (seasons/episodes/guest stars), custom roles, moderation (IP tracking, suspensions, field locking), discussions, reports, edit history, image galleries, user profiles (edit + password), similar-content, leaderboard, TMDB-style pages, inline actor creation.

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind + Shadcn UI
- Auth: JWT cookie-based, bcrypt

## Implemented (highlights)
- Auth with profile edit + password change
- Movies, TV Series (seasons/episodes/guest stars), Actors — full CRUD
- Admin panel with role & custom-role assign
- Moderation: IP tracking, suspensions, per-field locking
- Discussions, forum threads, reports
- Edit history + revert
- Cross-type similar content
- TMDB-style pages: Movie Detail, Movie Edit, User Profile, Series Detail, **Series Edit** (new 2026-09-29)
- Cast dialog with inline actor creation
- Series detail expandable seasons showing episodes + first/last air date row

## Changelog 2026-09-29
- Everything listed above.
- **Series edit page** (`/series/:id/edit`): TMDB-style layout mirroring MovieEdit. Sidebar sections: Primary Facts, Main Cast (uses CastEditDialog), Creators, Genres, Keywords, Taglines, Videos, Images, Seasons. Per-field padlocks wired to `/series/{id}/lock`. Content Score card, Ctrl+S save. Seasons section: expandable season cards with number/name/air date/overview/poster and an inline episode editor (episode number, title, air date, overview, still image). Add/remove for seasons and episodes.
- **Series detail improvements**:
  - Hero now shows a first-aired / last-aired row with green + rose calendar icons under the badge line.
  - The old flat "All Seasons" grid replaced with expandable season blocks that reveal their episodes (S·E code, title, air date, overview, still image, guest stars).
  - Edit buttons in the header and sidebar navigate to `/series/:id/edit`.

## Backlog (P1/P2)
- P1: Actor detail redesign
- P1: TV Series reviews (unlock TV Score on user profile)
- P1: Browse filters (genre, year, rating)
- P1: Forgot-password / email reset
- P2: Guest star editor inside episodes (currently deferred to season-level; add per-episode dialog reusing CastEditDialog)
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
