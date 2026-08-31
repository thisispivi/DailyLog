# ADR 0003: Retire the Telegram transport

## Status

Accepted — 2026-08-31

## Context

The Telegram adapter encoded long sequential wizards, keyboard state, command aliases, and activity locks around otherwise small journal operations. Maintaining it beside the web app would retain Python, duplicate validation and localization, and keep two interaction models in sync.

## Decision

Retire the Telegram runtime after porting its useful behavior: meals, training, sleep, weigh-ins, backdating, editing, daily views, bulk deletion, trash restore, settings, and XLSX/PDF reports. The web interface becomes the sole product transport.

The SQLite schema and saved user ID remain compatible. A pre-migration backup preserves a rollback source; the Git history preserves the retired implementation.

## Consequences

- The repository uses Node.js and TypeScript throughout active product code.
- Users gain direct forms, search, filters, charts, and contextual editing instead of chat wizards.
- Telegram commands no longer run. Reintroducing a bot would require a new thin adapter over the TypeScript domain/API rather than restoring the old handler architecture.
