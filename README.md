# Cineverse

Streaming platform (Cineora): Next.js frontend in `frontend/`, NestJS + Prisma API in `backend/`. See PROJECT.md.

## Run locally

- Backend: copy `backend/.env.example` to `.env`, fill it in, then `pnpm install && pnpm db:push && pnpm db:seed && pnpm dev` (needs Postgres; Redis and Meilisearch optional).
- Frontend: set `API_URL` and `NEXT_PUBLIC_API_URL` in `frontend/.env.local`, then `pnpm install && pnpm dev`.

## Features and operations notes

See `docs/FEATURE_ROADMAP.md` for the full feature checklist (continue watching, Top 10, hover cards, match %,
skip intro, notifications, search, reports/requests, watch parties, profile prefs/PIN, collections, lists,
email verification/reset, PWA, Chromecast, admin analytics).

- **Schema changes:** this work added tables and columns. Apply them with `pnpm db:push` in `backend/` before deploying.
- **Email:** set `APP_URL`, `SMTP_URL` and `MAIL_FROM` (see `backend/.env.example`). Without `SMTP_URL` the verification and
  reset links are written to the API log instead of being sent.
- **Intro/credits markers:** set per episode or per season in the admin panel (Catalog tab). Skip intro and the Next-episode
  card only appear for episodes that have markers.
- **Watch party:** rooms live in API memory, so run a single API instance (or add the socket.io Redis adapter first).
- **PWA:** the service worker is registered in production builds only.
- **Cast:** Chromecast needs a publicly reachable HTTP(S) stream URL (direct/HLS sources). Embedded servers and YouTube cannot be cast.
