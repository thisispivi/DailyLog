---
name: add-api-endpoint
description: Add or change a DailyLog API route under daily-log/src/app/api. Use when creating a route.ts, adding an HTTP method to one, changing a request body or query schema, or wiring a new client mutation to the server.
---

# Add an API endpoint

Rules come from docs/CODING_STANDARDS.md ("Runtime validation", "API conventions", "Database", "Demo"). Paths are relative to `daily-log/`.

## Entry points

- `src/core/http/api.ts`: `authenticatedRoute`, `publicRoute`, `ok`, `readJson`, `readQuery`, `ApiError`.
- `src/features/<feature>/schemas.ts`: request schemas. Shared record schemas are in `src/features/logbook/schemas.ts` (`createEntrySchema`, `updateEntrySchema`, `createWeighInSchema`, ...).
- `src/features/logbook/domain.ts`: domain errors `RecordNotFoundError`, `DuplicateOpenActivityError`, `InvalidEntryRangeError`.
- `src/infrastructure/database/logbook-repository.ts`: `LogbookRepository`, the only place SQL lives.
- `src/core/http/client.ts`: `sendJson` for client mutations.
- `demo/shell/api.ts`: the demo's route table.

`src/app/api/weigh-ins/route.ts` is a short, complete example.

## Steps

1. **Schema.** Add a `z.strictObject` to the owning feature's `schemas.ts`. Reuse existing schemas (`.partial()`, `.extend()`) instead of repeating fields. Derive the type with `z.infer`.
2. **Repository.** Add a method to `LogbookRepository` that takes `userId` first and filters every statement by it, updates and deletes included. Parameterize all SQL; never interpolate client input.
3. **Route.** In `src/app/api/<resource>/route.ts`, export `GET`/`POST`/`PATCH`/`DELETE` wrapped in `authenticatedRoute` (or `publicRoute` only for unauthenticated flows like login). Parse with `readJson(request, schema)` or `readQuery(request, schema)`, never `request.json()`. Return `ok(data)` or `ok(data, 201)`. Throw domain errors or `ApiError` for expected failures.
4. **Demo.** Import the route module in `demo/shell/api.ts` and add it to `routes`. More specific patterns go before parameter patterns (`/api/entries/day` before `/api/entries/:id`). Skip this only for handlers that need Node, like the report exports, and say why in the PR.
5. **Client.** Call it with `sendJson` and show pending, success, and failure states. New UI text goes in `src/core/i18n/catalogs.ts` in English and Italian.
6. **Tests.** Schema tests in the feature's `schemas.test.ts` (accepted shape, important rejections, defaults). Repository behaviour in `src/infrastructure/database/logbook-repository.test.ts`, including that another `userId` can't see or change the row.
7. **Check.** Run the `check` skill, including `npm run demo:build`. Add `npm run test:e2e` if a user flow changed.

## Hard rules

- No route without a wrapper: it owns the request ID, same-origin check, session check, and error envelope.
- No raw sort column, SQL fragment, or file path from the client.
- No `as` casts on parsed request data.
- Don't log request bodies, journal text, or weights.

## Failure modes

- Demo returns 501 for the new path: step 4 was skipped or the pattern is shadowed by an earlier one.
- 403 in a manual `curl` test: the origin check. Send a matching `Origin` header.
- Typecheck fails only in `demo`: a shimmed module gained an export (see the `check` skill).

## Stop and ask

When the endpoint needs a new table or column (use `change-database-schema` and confirm the data model first), exposes data without a session, or changes the response shape of an existing route that the client or a backup file depends on.
