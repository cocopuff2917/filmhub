# CineVerse — Movie & TV Series Database (PRD)

## Original Problem Statement
Build a modern movie database web app (IMDb/TMDB style, dark mode) with Home, Movie Detail, Actor Detail, global search, and admin panel. Extended with TV Series (seasons/episodes/guest stars), granular custom roles, moderation (IP tracking, suspensions, field locking), discussions, reports, edit history, image galleries, user profiles, similar-content suggestions, leaderboard, TMDB-style movie detail page, and TMDB-style user profile page.

## Tech Stack
- Backend: FastAPI + MongoDB (`server.py` monolith, PyObjectId models)
- Frontend: React + Tailwind + Shadcn UI (dark theme + selective light surfaces on user profile)
- Auth: JWT cookie-based (httpOnly, SameSite=None)

## Implemented
- Auth (register/login/me/logout), custom roles with granular permissions
- Movies, TV Series (seasons/episodes/guest stars), Actors — full CRUD
- Admin panel: Users (with role & custom role assignment), Roles, IP Overlap, Movies, Series, Actors tabs
- Moderation: IP tracking, account suspensions (hidden from public), field locking
- Discussions, forum threads, Report a Problem
- Edit history with field diffs; revert for moderator/admin on movie/series/actor updates
- Cross-type similar content (movies + series) scored by genres, cast, and release-year proximity
- Image galleries, leaderboard; suspended users hidden from public
- TMDB-style Movie Detail page (view tracking, stats, contributors, content score, popularity trend)
- **TMDB-style User Profile page** (2026-09-29)

## Changelog 2026-09-29
- IP Overlap: fixed missing `Link` import.
- Related content endpoints now return mixed movies + series scored by genre/cast/year.
- Edit revert endpoint + Revert button; custom-role assignment UI in Admin Users list.
- Movie detail redesign + new fields (tagline, status, budget, revenue, awards, keywords, crew, video_urls) + view tracking + stats.
- User profile redesign:
  - Backend `/users/{id}` now returns `total_ratings`, `avg_movie_rating`, `avg_series_rating`, `rating_distribution`, `top_genres`, `recent_entities` (grouped by entity with poster + edit count), and `daily_activity_30d` (movies/series/actors).
  - Hero: dark radial with decorative red accents, big circular avatar (initial fallback), name, custom-role/role badge, member-since, Movie Score and TV Score circles, Change Avatar.
  - Sub-nav: Overview / Reviews / Edit History tabs.
  - Overview: Total Edits (rose) · Total Ratings (rose) · Rating Overview histogram · Most Watched Genres donut · Recent Activity grid · 30-Day stacked area chart with toggleable legend.
  - Reviews and Edit History surfaces preserved on light surfaces.

## Backlog (P1/P2)
- P1: TV Series detail page redesign (parity with movie detail)
- P1: Actor detail redesign
- P1: Advanced filtering/sorting on Browse (genre, year, rating)
- P2: Series reviews so `avg_series_rating` powers the TV Score circle
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
