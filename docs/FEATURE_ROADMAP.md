# Cineora feature roadmap

Working checklist. Each feature was built, then verified (typecheck, lint, unit tests and an API/browser smoke test against a scratch database) before being ticked.
`[x]` done and verified · `[ ]` not done · **Audit** = what already existed before this roadmap.

Conventions: backend in `backend/src/<module>`, schema in `backend/prisma/schema.prisma` (applied with `prisma db push`),
frontend components in `frontend/src/components`, API calls in `frontend/src/lib/client-api.ts`.

> Schema changes were NOT pushed to your real database. Run `pnpm db:push` in `backend/` when deploying.

---

## 1. Continue Watching, "Because you watched", "Top 10 today"
**Audit:** `/me/home` already returned *Continue watching* (resume + next-episode advance) and *Because you …* rows. No Top 10, no way to remove an item.
- [x] Backend: `GET /home` gains a shared **Top 10 today** row (24h views + watches + saves, quality fallback), cached
- [x] Backend: `DELETE /me/history/:titleId` (drop a title from Continue watching / history)
- [x] Frontend: ranked Top 10 row (large rank numerals) rendered first on home
- [x] Frontend: "Remove" button on Continue-watching cards
- [x] Unit test for the Top 10 ranking

## 2. Hover preview cards
**Audit:** `TitleCard` played a muted trailer on hover/long-press. No expanded card, no match %, no quick actions.
- [x] `HoverCard` portal (not clipped by the row scroller): trailer, match %, rating, runtime, genres
- [x] Quick actions: Play, My List toggle, thumbs up/down, More info
- [x] Keyboard/focus and touch fallback preserved; respects reduced motion, data saver and the profile's autoplay-previews setting
- [x] Viewport-aware positioning

## 3. Thumbs up/down + match %
**Audit:** Thumbs up/down (`Rating`, `/me/ratings`) existed and fed *Picked for you*. No match %.
- [x] Shared taste model (`titles/affinity.ts`) used by *Picked for you* and match %
- [x] `GET /me/match?ids=…` → `{ slug: 0‑100 }`
- [x] `useMatch` batching hook; "NN% match" on the title page and hover card
- [x] Unit tests for the scoring

## 4. Auto-play next episode + skip intro (+ countdown overlay)
**Audit:** Player had a next-episode countdown on `ended` and a *fixed-window* "Skip intro" guess (3–90 s) for every series.
- [x] Schema: `Episode.introStartSec`, `introEndSec`, `creditsStartSec`
- [x] Backend: admin endpoints to set markers per episode / per season; markers exposed on the title response
- [x] Admin UI: episode marker editor (Catalog tab)
- [x] Player: skip intro only when markers exist (no more guessing); "Next episode" card at the credits marker; countdown at the end
- [x] Per-profile autoplay-next / auto-skip-intro toggles honoured by the player
- [x] Tests for marker validation

## 5. Notifications + "Coming soon"
**Audit:** `/new` was just a sorted browse.
- [x] Schema: `Notification`, `Reminder`
- [x] Backend: `GET /upcoming`; reminders; `GET /me/notifications`, mark read / all read
- [x] Triggers: first playable source on a listed title; new episode (admin endpoint and TMDB import); reminder title released (hourly sweep)
- [x] Frontend: `/coming-soon` with *Remind me*; bell with unread badge + dropdown in the navbar
- [x] Tests for notification fan-out and de-duplication

## 6. Search upgrades
**Audit:** Navbar autocomplete (titles only) → `/browse?q=`; filters limited to type/genre/language.
- [x] Backend: relevance-ranked search over name, **genre, cast/crew**, overview (Postgres; Meili documents extended too)
- [x] Backend: filters `year`, `yearFrom/yearTo`, `language`, `rating`, `type`, `genre`
- [x] `GET /search/suggest` → titles + people + genres
- [x] Frontend: grouped suggestions, **recent searches** (per device, clearable), mobile recents
- [x] Browse filter bar: release year, rating (plus existing type/language/genre/sort)
- [x] Tests for the query builders and recent-search helper

## 7. Reporting and requests
**Audit:** The player auto-switched on failure; nothing was reported. No title requests.
- [x] Schema: `SourceReport`, `TitleRequest`, `TitleRequestVote`
- [x] Backend: `POST /playback/report`; auto-flag after 3 distinct viewers (stored source → `FAILED`; built-in server hidden for that title/episode)
- [x] Backend: `/requests` (list, create with duplicate detection, vote); admin decide (notifies voters when added)
- [x] Frontend: "Report a problem" in the player; `/requests` page
- [x] Admin Moderation tab: reported sources (restore / dismiss) and requests
- [x] Tests for the auto-flag rule

## 8. Watch party upgrades
**Audit:** Gateway, rooms and WebRTC signaling existed (`/party`) but there was **no frontend client at all**; no chat or reactions.
- [x] Gateway: `party:chat` (history, rate limited), `party:reaction` (whitelist), presence, sync indicator names
- [x] Gateway: authentication moved into a socket.io middleware (fixes a join race); excluded from the HTTP IP throttler, per-socket limits instead
- [x] Frontend: `useParty`, `PartyPanel` (members, chat, reactions, indicator, "press play together" countdown for embeds)
- [x] Invite links: `/party/[code]`; copy-link button; navigation follows the room
- [x] Player sync of play/pause/seek both ways without feedback loops (verified with two browsers)
- [x] Tests for room, chat, rate limit and sync planning

## 9. Per-profile subtitle/audio/autoplay preferences
**Audit:** `prefs.ts` only held per-device theme/accent/motion.
- [x] Schema: `Profile.prefs`
- [x] Backend: `GET/PUT /me/profile-prefs` (validated, partial updates)
- [x] Settings section: audio language, subtitle language, subtitle size, autoplay next, autoplay previews, auto-skip intro
- [x] Applied in the player (tracks, subtitle size, autoplay, auto-skip), hover previews, and embed server ordering by audio language
- [x] In-player subtitles/audio menu (when the stream exposes tracks), which also saves to the profile
- [x] Tests for validation/merge and server ordering

## 10. Personalization and discovery
**Audit:** "More like this" existed (genre Jaccard + language + co-watch). No cast overlap, no collections, one watchlist only.
- [x] `related()` blends cast/crew overlap and pulls in people-linked titles
- [x] Mood / genre **collections**: `GET /collections[/:key]`, `/collections` pages, mood chips on home (kids-safe subset for kids profiles)
- [x] Schema `UserList`/`UserListItem`; CRUD API; "Add to list" on the title page; `/lists` and `/lists/[id]`
- [x] Tests for collections and related scoring

## 11. Engagement and account
**Audit:** No activity page, no PIN, no email verification/reset.
- [x] `/activity`: history grouped by day, remove one / clear all (`GET /me/activity`)
- [x] Profile PIN: argon2 hash, `verify-pin` → 12 h profile token enforced server-side, lockout after 5 wrong tries, picker + editor UI
- [x] Email verification (`User.emailVerifiedAt`, `EmailToken`), reminder banner with resend
- [x] Password reset: `/auth/forgot-password`, `/auth/reset-password` (signs out everywhere); pages `/forgot-password`, `/reset-password`, `/verify-email`
- [x] Mailer: SMTP via `SMTP_URL` (nodemailer); logs the link when unset
- [x] Tests for token one-time use/expiry and the PIN lockout

## 12. Platform: PWA, Chromecast, admin analytics
**Audit:** Not present.
- [x] PWA: manifest, icons (incl. maskable), service worker (static + poster cache, offline page), install button in Settings
- [x] Chromecast: Cast button in the video controls (Google Cast SDK) with Remote Playback / AirPlay fallback; "Casting to …" overlay
- [x] Admin analytics: `GET /admin/analytics` + Overview tab (totals, daily views/sessions/signups, top titles, dead sources)
- [x] Docs: README notes and `.env.example` for `APP_URL`, `SMTP_URL`, `MAIL_FROM`
- [x] Tests for analytics helpers and cast URL helpers

---

## Final pass
- [x] `backend`: `pnpm typecheck` clean; `pnpm test` 67 passed, 1 pre-existing unrelated failure (see below)
- [x] `frontend`: `tsc --noEmit` clean, `eslint` clean, `pnpm test` 26 passed
- [ ] `frontend`: production `next build`: **not completed**, the machine's disk filled up during the build (see below)
- [x] API smoke tests for every backend feature against a scratch database; browser checks for the main UI flows
- [x] This file ticked; limitations recorded below

## Known limitations
- **Production build not verified.** The disk reached 100% while `next build` was running, so only typecheck, lint and the dev server were verified. Free some disk space and run `pnpm build` in `frontend/`.
- **Embedded servers (iframes) can't report playback.** Auto-next, skip intro, watch-party sync, subtitle/audio menus and Cast only work for direct/HLS sources. Watch parties fall back to chat, reactions and a "press play together" countdown for embeds.
- **Chromecast** is written against the Google Cast sender SDK but was not exercised on real hardware; it needs a publicly reachable stream URL.
- **Subtitle/audio menu** appears only when the stream exposes tracks (e.g. HLS renditions).
- **Watch-party rooms and PIN-attempt counters live in API memory** (single instance). Scaling out needs the socket.io Redis adapter and a shared store.
- **Meilisearch path** (people/year/rating filters) is written but only the Postgres fallback was verified; no Meili instance was available.
- **Email** needs `SMTP_URL`; without it links are only logged. Existing accounts see the "confirm your email" reminder until verified.
- **Schema** changes were applied to a local scratch database only. Run `pnpm db:push` against your real database when deploying.
- **Pre-existing unrelated test failure:** `backend/test/units.test.ts` "provider registry … reports enabled, disabled and content types" (expects `peestream` disabled) fails on the untouched provider registry.
