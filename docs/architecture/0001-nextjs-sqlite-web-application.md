# ADR 0001: Next.js application with direct SQLite persistence

## Status

Accepted — 2026-08-31

## Context

DailyLog began as a private Python Telegram bot. Its useful domain behavior is small and cohesive, while the requested web interface needs server rendering, authenticated APIs, responsive forms, localized reports, and one deployable artifact. Existing SQLite records and identifiers must survive the transition.

## Decision

Use a single Next.js application with strict TypeScript, React Server Components for initial private data, route handlers for mutations and downloads, Zod for external input, and a direct `better-sqlite3` repository adapter.

Keep feature modules independent of transport details. Preserve the original `entries`, `weigh_ins`, and `user_settings` tables, apply additive schema migrations, and create a backup before migrating a legacy database.

## Consequences

- The application deploys as one Node process and keeps SQLite operational simplicity.
- There is no duplicated REST client/server domain package or ORM-generated model layer.
- A single process is the intended deployment. Horizontal scaling would require moving persistence and login throttling to shared services.
- Database migrations and ownership tests are explicit and remain framework-independent.
