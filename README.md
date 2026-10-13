# Cineverse

Streaming platform (Cineora): Next.js frontend in `frontend/`, NestJS + Prisma API in `backend/`. See PROJECT.md.

## Run locally

- Backend: copy `backend/.env.example` to `.env`, fill it in, then `pnpm install && pnpm db:push && pnpm db:seed && pnpm dev` (needs Postgres; Redis and Meilisearch optional).
- Frontend: set `API_URL` and `NEXT_PUBLIC_API_URL` in `frontend/.env.local`, then `pnpm install && pnpm dev`.
