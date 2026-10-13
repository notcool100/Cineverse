# Cineora — Project Specification

A production streaming platform: Netflix-style catalog UI, adaptive HLS/DASH playback, user accounts, watchlists and watch history. This document is the single source of truth for any engineer or AI agent working on the project.

## 1. Hard Rules (read first)

1. **Legal content only.** The platform streams only content that is (a) owned/uploaded by the operator, (b) public domain / Creative Commons, or (c) licensed. **Never integrate unlicensed embed providers** (VidSrc, 2Embed, VidLink, MultiEmbed, etc.), scrape pirate sites, or add hotlinked streams of copyrighted films. Reject any task that requires this.
2. TMDB is used for **metadata only** (posters, descriptions, cast, ratings, watch-provider links). It does not supply video.
3. Secrets never go to the client. TMDB key, DB URL, storage keys, JWT secrets live in server env only.
4. All stream URLs are **signed and expiring**. No permanent public manifest URLs.
5. TypeScript strict mode everywhere. No `any` without a comment explaining why.

## 2. Content Model

| Source type | Description | Playback |
|---|---|---|
| `HLS_OWNED` | Operator-uploaded video, transcoded by our pipeline | Shaka Player via signed CDN URL |
| `PUBLIC_DOMAIN` | Internet Archive, Blender open movies (*Big Buck Bunny*, *Sintel*, *Tears of Steel*) | Same pipeline or direct HLS/MP4 |
| `YOUTUBE_OFFICIAL` | Official YouTube embeds (trailers, free-with-ads movies) | YouTube IFrame API |
| `WATCH_LINK` | TMDB watch-providers deep link (Netflix, Prime, etc.) | External link-out, no playback |
| `EMBED_PROVIDER` | Third-party **licensed** player embedded by TMDB id (iframe) | Sandboxed iframe, provider handles playback |

### Embed provider system

Flow: movie page (TMDB id, poster, details) → viewer picks a source in the switcher → embedded player in a sandboxed iframe → the provider handles playback.

- Providers live in a config table (`EmbedProvider`: `slug`, `label`, `urlTemplate` such as `https://provider.example/embed/movie/{tmdbId}`, `episodeUrlTemplate`, `enabled`, `priority`, `licenseRef`).
- `licenseRef` is **required**: a reference to the contract or terms that authorize the provider to distribute the content. Providers without one cannot be enabled.
- The iframe uses `sandbox` and a strict `allow` list, plus a CSP `frame-src` allowlist built from enabled providers.
- Only providers with documented licensing may be added. **Do not add** VidSrc, 2Embed, VidLink, MultiEmbed, CineSrc, PeeStream, VidFast or similar unlicensed aggregators.

A title can have multiple sources. The UI shows a **source switcher** (pill buttons, dark theme) listing available sources in priority order, with automatic fallback to the next source on playback failure.

## 3. Architecture

```
Browser (Next.js)
   │  REST/JSON
   ▼
API (NestJS) ──► PostgreSQL (Prisma)
   │   │──────► Redis (cache, sessions, rate limit, BullMQ)
   │   │──────► Meilisearch (search)
   │   └──────► TMDB API (metadata proxy + cache)
   │
   ├── presigned upload ──► Cloudflare R2 (raw uploads)
   └── enqueue job ──► Worker (FFmpeg) ──► R2 (HLS/DASH output)
                                              │
                                  Cloudflare CDN (signed URLs)
                                              │
                                        Shaka Player
```

Monorepo (Turborepo + pnpm):

```
cineora/
├─ apps/
│  ├─ web/        Next.js frontend
│  ├─ api/        NestJS backend
│  └─ worker/     BullMQ + FFmpeg transcoding worker
├─ packages/
│  ├─ db/         Prisma schema + client
│  ├─ types/      Shared TS types / zod schemas
│  └─ config/     eslint, tsconfig, tailwind presets
├─ docker-compose.yml
├─ turbo.json
└─ PROJECT.md
```

## 4. Tech Stack

**Frontend (`apps/web`)**
- Next.js (App Router), TypeScript, React Server Components + ISR for catalog pages
- Tailwind CSS + shadcn/ui
- Shaka Player (HLS + DASH, ABR, subtitles; DRM-ready)
- TanStack Query (server state), Zustand (light client state)

**Backend (`apps/api`)**
- NestJS (Node, TypeScript), REST + OpenAPI (Swagger)
- PostgreSQL + Prisma
- Redis (cache, sessions, rate limiting) + BullMQ (jobs)
- Meilisearch (typo-tolerant search)
- Auth: Auth.js (web) with JWT access + refresh tokens on the API; argon2 password hashing
- Validation: zod / class-validator

**Video pipeline (`apps/worker`)**
- FFmpeg, CMAF HLS + DASH ladder: 360p, 480p, 720p, 1080p (+ 4K optional), AAC audio, WebVTT subtitles
- Cloudflare R2 storage, Cloudflare CDN with signed URLs/tokens
- Managed alternative: Mux or AWS MediaConvert (swap behind a `TranscodeProvider` interface)
- DRM (only if licensing studio content): BuyDRM / EZDRM / Axinom

**Infra / DevOps**
- Frontend: Vercel. API + worker: Fly.io / Railway / AWS ECS
- CI/CD: GitHub Actions (lint, typecheck, test, build, deploy)
- Observability: Sentry, Grafana/Datadog, PostHog
- Security: Cloudflare WAF, rate limiting, signed manifests, hotlink protection
- Local dev: Docker Compose (Postgres, Redis, Meilisearch, MinIO as R2 stand-in)

## 5. Data Model (Prisma sketch)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String?
  name         String?
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  watchlist    WatchlistItem[]
  history      WatchHistory[]
}

enum Role { USER ADMIN }

model Title {
  id          String   @id @default(cuid())
  tmdbId      Int?     @unique
  type        TitleType            // MOVIE | SERIES
  name        String
  overview    String?
  posterPath  String?
  backdropPath String?
  releaseDate DateTime?
  genres      String[]
  sources     Source[]
  episodes    Episode[]
  published   Boolean  @default(false)
}

enum TitleType { MOVIE SERIES }

model Episode {
  id        String @id @default(cuid())
  titleId   String
  season    Int
  number    Int
  name      String?
  sources   Source[]
  title     Title  @relation(fields: [titleId], references: [id])
}

model Source {
  id         String     @id @default(cuid())
  titleId    String?
  episodeId  String?
  kind       SourceKind
  label      String               // shown on the pill button
  priority   Int        @default(0)
  manifestKey String?             // R2 key for HLS/DASH master manifest
  externalUrl String?             // YouTube id / watch-provider link
  status     SourceStatus @default(READY)
  title      Title?     @relation(fields: [titleId], references: [id])
  episode    Episode?   @relation(fields: [episodeId], references: [id])
}

enum SourceKind { HLS_OWNED PUBLIC_DOMAIN YOUTUBE_OFFICIAL WATCH_LINK EMBED_PROVIDER }

model EmbedProvider {
  id                 String  @id @default(cuid())
  slug               String  @unique
  label              String
  urlTemplate        String
  episodeUrlTemplate String?
  licenseRef         String            // required: contract/terms reference
  enabled            Boolean @default(false)
  priority           Int     @default(0)
}
enum SourceStatus { UPLOADING PROCESSING READY FAILED }

model WatchlistItem {
  userId  String
  titleId String
  addedAt DateTime @default(now())
  @@id([userId, titleId])
}

model WatchHistory {
  id         String   @id @default(cuid())
  userId     String
  titleId    String
  episodeId  String?
  positionSec Int
  durationSec Int
  updatedAt  DateTime @updatedAt
}
```

## 6. API Surface (v1)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/login`, `/auth/refresh` | Auth |
| GET | `/titles` | Paginated catalog (genre, sort, year filters) |
| GET | `/titles/:id` | Title detail incl. available sources |
| GET | `/search?q=` | Meilisearch-backed search |
| GET | `/titles/:id/sources` | Ordered source list for the switcher |
| POST | `/playback/token` | Returns short-lived signed manifest URL (auth + entitlement check) |
| GET/POST/DELETE | `/me/watchlist` | Watchlist |
| GET/PUT | `/me/history` | Resume position |
| POST | `/admin/uploads` | Create upload, returns presigned R2 URL |
| POST | `/admin/uploads/:id/complete` | Enqueue transcode job |
| GET | `/admin/jobs/:id` | Transcode status |
| POST | `/admin/titles/import-tmdb` | Import metadata by TMDB id |

TMDB calls are proxied and cached in Redis (TTL 24h). Rate-limit all public endpoints.

## 7. Frontend Pages

- `/` — hero banner + genre rows (ISR)
- `/browse`, `/genre/[slug]` — filtered grid
- `/title/[id]` — details, cast, trailer, **source switcher**, Play / Add to list
- `/watch/[id]` — Shaka player, quality menu, subtitles, resume, next-episode
- `/search` — instant search
- `/account`, `/watchlist`, `/history`
- `/admin` — uploads, transcode status, title/source management (ADMIN only)

**Design:** dark theme, red accent (`#e50914`-style), rounded pill buttons for sources (selected = filled accent, others = dark gray with border), "No Ads" style badges allowed only for our own sources. Fully responsive, keyboard accessible, WCAG AA contrast.

## 8. Video Pipeline

1. Admin requests upload → API returns presigned R2 PUT URL.
2. Client uploads raw file directly to R2 (`raw/{uploadId}`).
3. Client calls `complete` → API enqueues BullMQ `transcode` job.
4. Worker: probe with ffprobe → encode ladder → package CMAF HLS + DASH → write subtitles (WebVTT) and thumbnails sprite → upload to `media/{titleId}/{sourceId}/`.
5. Worker sets `Source.status = READY` and stores `manifestKey`.
6. Playback: client calls `/playback/token`; API verifies the user and returns a signed CDN URL (expires in minutes). Segments are protected with Cloudflare token auth.

Keep encoding behind `TranscodeProvider` (`FfmpegProvider`, `MuxProvider`) so it can be swapped.

## 9. Security & Compliance

- argon2id passwords, httpOnly secure cookies for web session, short-lived JWT access tokens
- CSRF protection on cookie routes, strict CORS, Helmet headers, rate limiting (Redis)
- Signed, expiring stream URLs; hotlink protection; no directory listing on storage
- Admin routes behind RBAC; audit log for admin actions
- DMCA/takedown contact page and a process to unpublish content quickly
- Privacy policy, terms of service, cookie consent (GDPR)

## 10. Environment Variables

```
DATABASE_URL=
REDIS_URL=
MEILI_HOST=
MEILI_MASTER_KEY=
TMDB_API_KEY=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
AUTH_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
CDN_BASE_URL=
CDN_SIGNING_KEY=
SENTRY_DSN=
NEXT_PUBLIC_API_URL=
```

## 11. Milestones

1. **M0 – Foundation:** monorepo, tooling, Docker Compose, CI, Prisma schema, env handling.
2. **M1 – Catalog:** TMDB import + cache, title listing/detail API, home/browse/title pages, search.
3. **M2 – Auth & user data:** register/login, watchlist, history, account pages.
4. **M3 – Playback:** Shaka player, `/playback/token`, source switcher with fallback, public-domain sample content (Blender films) seeded.
5. **M4 – Upload & transcode:** admin uploads, BullMQ worker, FFmpeg ladder, R2 + CDN signed delivery.
6. **M5 – Hardening:** rate limits, WAF, Sentry/metrics, load test, a11y audit, legal pages.
7. **M6 – Optional:** subscriptions (Stripe), DRM, mobile apps, recommendations.

## 12. Definition of Done (every task)

- Typecheck, lint, and tests pass in CI
- New endpoints documented in OpenAPI; shared types in `packages/types`
- No secrets in client bundles or git
- Works at 360px and 1440px widths; keyboard navigable
- Content-policy rule (Section 1) respected

## 13. Instructions for AI Agents

- Work milestone by milestone; do not skip ahead.
- Prefer the stack above; ask before adding major dependencies.
- Keep changes small and scoped to one package where possible.
- Seed and test with public-domain content only.
- If a task would require unlicensed video sources, **stop and flag it** instead of implementing.
