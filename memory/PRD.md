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
- **Email-based password reset** (2026-09-29 late): New `/forgot-password` and `/reset-password` frontend pages, plus `POST /api/auth/forgot-password` (silent to prevent enumeration) and `POST /api/auth/reset-password` (bcrypt-hashed token, 60-min expiry, single-use, invalidates siblings on issue and on use). Emails go through Emergent's managed email proxy (`EMERGENT_EMAIL_KEY` + `EMAIL_FROM_NAME=CineVerse`). Login page shows a "Forgot password?" link next to the password label. Guardrail gate `_assert_safe_email` enforced on every send. Verified end-to-end via curl (`delivered@resend.dev` → 202 Accepted; token replay → 400; login with new pw → 200).
- **Notifications + Inbox + Mod DMs + Suspended-login-with-inbox** (2026-09-29 later):
  - `notifications` collection with typed events: `direct_thread`, `direct_thread_reply`, `thread_reply`, `suspension`. Endpoints: `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/{id}/read`, `POST /api/notifications/mark-all-read`.
  - Bell icon in the navbar (`NotificationBell.jsx`) polls unread count every 30 s, dropdown lists last 20, click marks-as-read and deep-links to the thread.
  - `POST /api/moderation/threads` (moderator/admin only) creates a private thread with `category="direct"`, `is_direct=true`, `target_user_id`, and fires a notification to the target. Public `GET /api/threads` excludes direct threads for non-mods; `GET /api/inbox/threads` returns direct threads visible to current user (participant or mod). New "Message" button on every non-admin user row in Admin → Users opens `MessageUserDialog`.
  - Suspended users can now log in (removed 403 on `/auth/login`, `/auth/me` uses `get_current_user_allow_suspended`). New helper `get_current_user_allow_suspended` returns the user with `is_suspended`, `suspension_reason`, `suspension_until` flags. All other auth deps (`get_current_user`, `get_current_admin`, `get_current_moderator`) still 403 suspended users — no existing endpoint became suddenly permissive. Direct-thread endpoints (`/threads/{id}` view, `/threads/{id}/messages` reply) use the allow-suspended dep with explicit participant permission checks.
  - Frontend: `SuspendedGuard` in `App.js` allows only `/inbox`, `/threads/:id`, and auth pages; every other route redirects to `/inbox`. Persistent red banner in the navbar shows suspension reason & duration. Navbar strips Home/Browse/TV/Forum/Watchlist/Admin/Create for suspended users; keeps bell + Sign out + inbox. Verified end-to-end via curl + UI screenshots (mod creates direct thread → target's `unread-count=1` → target replies → forbid public thread create/post, allow direct reply).

## Backlog (P1/P2)
- P1: Drag-to-reorder for crew, creators, and season/episode lists
- P1: Actor detail redesign (parity)
- P1: TV Series reviews (unlock TV Score on user profile)
- P1: Browse filters (genre, year, rating)
- P1: Watchlist/Favorites end-to-end polish
- P2: Password change notice email after successful reset
- P2: Notifications for public thread replies rendered on user's own profile (currently created but only surfaced via bell)
- P2: Actor place of birth / place of death fields
- P2: Threads/Forum layout redesign (TMDB-style sidebar + search)
- P2: Verify custom sender domain on Resend so mails can come from `noreply@cineverse.app` instead of the platform default
- P2: Refactor `server.py` into APIRouter modules

## Credentials
- Admin: admin@cineverse.com / Admin@123
