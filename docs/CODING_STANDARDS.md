# DailyLog coding standards

The single source of truth for how code is organized and written here. Rules marked **(enforced)** fail lint, typecheck, or CI.

## Where things go

All application paths below are relative to `daily-log/`. Run npm commands from that directory. Repository documentation, GitHub workflows, and Git hooks remain at the repository root.

```text
src/
├── app/                      Next.js routes only: pages, layouts, route handlers, page CSS
├── features/<feature>/       Domain logic, schemas, and UI for one product area
│   ├── <name>.ts             Pure logic, next to its <name>.test.ts
│   └── ui/                   React components owned by the feature
├── ui/                       Presentational pieces shared by features (logo, icons, sheet)
├── core/<concern>/           Cross-cutting policy: config, http, i18n, observability, preferences, security, time
└── infrastructure/<adapter>/ SQLite and any future external adapter
```

Adding a feature:

| You are adding…                      | Put it in                                                   |
| ------------------------------------ | ----------------------------------------------------------- |
| A page                               | `src/app/(app)/<route>/page.tsx` plus `<route>.css`         |
| An API endpoint                      | `src/app/api/<resource>/route.ts`, using the route wrappers |
| A request schema                     | The owning feature's `schemas.ts`                           |
| Business logic                       | `src/features/<feature>/<name>.ts`                          |
| Day totals, summaries, or streaks    | `src/features/insights/insights.ts`                         |
| A component used by one feature      | `src/features/<feature>/ui/`                                |
| A component used by several features | `src/ui/` (presentational only)                             |
| A database query                     | A method on `LogbookRepository`                             |
| A new environment variable           | `core/config/env.ts`, `.env.example`, and the README table  |
| UI text                              | `core/i18n/catalogs.ts`, English and Italian together       |

There is no `utils/` directory. If a helper has no obvious home, it probably belongs to the feature that uses it.

### Import direction (enforced)

```text
app → features → ui → core
 └──→ infrastructure → core
```

- Only `app/` and `proxy.ts` may import `infrastructure/`. Pages and routes read data and pass it down; the proxy reads the session version.
- `core/` never imports from `app/`, `infrastructure/`, or any feature's `ui/`.
- `ui/` never imports from `app/`, `infrastructure/`, or a feature's `ui/`.
- `features/logbook` holds the shared domain (record types, schemas, domain errors). Everything may import it.
- In `src`, `scripts`, and `tests`, import application code with `@/`, never `../` (enforced).
- No barrel files. Import from the file that owns the symbol.

## Runtime validation

TypeScript types vanish at runtime. Anything from outside the process is `unknown` until Zod has parsed it.

- **Validate at the boundary, once.** Request bodies, query strings, route params, cookies, and environment variables are parsed before they reach domain code. Domain and repository code trust their typed inputs and do not re-validate.
- **Use the route helpers.** `readJson(request, schema)` and `readQuery(request, schema)` turn malformed JSON and schema failures into a 400 response. Never call `request.json()` directly.
- **Strict request schemas.** Use `z.strictObject` so unknown keys are rejected rather than silently dropped. Update schemas list exactly the fields a client may change.
- **One contract per shape.** Define the schema and derive the type with `z.infer`. Do not write a matching interface by hand.
- **Compose, don't copy.** A larger contract reuses the schemas it contains. The backup schema is built from `createEntrySchema`, `settingsSchema`, and `profileSchema`, and update schemas are `.partial()` of the full one where the create schema allows it (`updateEntrySchema` re-declares its fields because `createEntrySchema` is refined).
- **No casts on external data.** `as SomeType` on parsed JSON, cookies, or env is a bug. Casts are acceptable for relational database rows, whose shape the schema's `CHECK` constraints guarantee, and for widening a literal type. JSON documents stored in the database are parsed with their schema.
- **Keep transforms simple.** Trimming and coercing query numbers is fine. Business rules belong in domain code.
- **Validation is not authorization.** A valid payload still needs a session, and every query is scoped by `userId`.

## API conventions

- Wrap every handler in `authenticatedRoute` or `publicRoute`. They own request IDs, the same-origin check, the session check, and error mapping.
- Success: `{ data: T }`. Failure: `{ error: { code, message, requestId, fields? } }`.
- Statuses: 400 invalid input, 401 no session, 403 bad origin, 404 missing owned record, 409 invariant conflict, 429 throttled.
- Throw domain errors (`RecordNotFoundError`, `DuplicateOpenActivityError`, `InvalidEntryRangeError`) or `ApiError`. Anything else becomes a generic 500 with no internal details.
- Never accept a raw sort column, SQL fragment, or file path from a client.

## Database

- Every repository method takes `userId` and every query filters by it, including updates, deletes, and restores. The one exception is `purgeExpiredTrash`, which hard-deletes expired trash for every owner.
- Timestamps are stored as UTC ISO strings with a `+00:00` suffix. Calendar days are computed in the configured timezone.
- Weight is stored as integer grams. Units are a display concern.
- Schema changes are additive: bump `SCHEMA_VERSION` and keep the pre-migration backup.
- Put invariants in the database too (`CHECK`, partial unique indexes) so concurrent requests cannot break them.

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` stay on (enforced).
- No `any`, no non-null assertions (enforced). Narrow `unknown` instead.
- Type-only imports are marked as type imports (enforced). Prefer the inline `import { type X }` form.
- Model finite states as literal unions derived from `as const` arrays, e.g. `entryKinds`.
- Prefer `Readonly<...>` props and domain records.

## React

- Server Components by default. Add `"use client"` only for interaction or browser APIs.
- Client mutations use `sendJson` from `core/http/client.ts`. It never throws, so every outcome reaches the UI.
- Every mutation shows pending, success, and failure states. Destructive actions confirm first.
- Every input has a label. Use semantic HTML before ARIA. Touch targets are at least 44px.
- Do not hardcode user-facing text. Add both languages in the same change.

## Styling

The full design system (colours, type, components, layouts, charts, copy, exports) is in [DESIGN.md](DESIGN.md). The rules that matter for code:

- Use tokens from `src/app/globals.css`, never literal colours. Each colour is declared once with `light-dark(light, dark)`; don't add dark-mode blocks.
- Record-type colours come from `data-kind` plus `--kind-tile` (background) and `--kind-ink` (text and icons).
- Reuse the base classes and the shared `Select`, `DateTimeField`, and `Sheet` components.
- Page styles sit next to the page (`today.css`). Component styles sit next to the component when it appears on several pages.

## Naming and comments

- Files are `kebab-case`. Components and types are `PascalCase`. Functions and values are `camelCase`. Module-level invariants are `UPPER_SNAKE_CASE`.
- Booleans read as facts (`isOpen`, `hasActiveActivity`). Handlers are named for their outcome (`finishActivity`).
- Comments explain why, not what. TSDoc goes on exported functions whose contract is not obvious from the signature.

## Logging and secrets

- Log through `core/observability/logger.ts` with dotted event names (`auth.login_rejected`) and the request ID.
- Never log passwords, cookies, request bodies, journal text, weights, or report contents.
- Read environment variables only through `getEnvironment()`.

## Tests

- Unit tests sit beside the code as `*.test.ts`. Repository tests use an in-memory SQLite database.
- Name tests as behaviour ("rejects meals with an end time"). Inject times instead of depending on the clock.
- Every bug fix gets a regression test where practical.
- For schemas, test the accepted shape, the important rejections, and any default or coercion. Skip trivial constraint-by-constraint tests.
- Browser flows live in `tests/e2e`. Run `npm run test:e2e` when you change a user workflow.

## Demo

The GitHub Pages demo (`daily-log/demo/`) runs the real pages and API route handlers in the browser on SQLite compiled to WebAssembly. The demo build swaps the server-only modules listed in `demo/next.config.ts` for browser versions in `demo/shims/`. When you add an export to one of those modules, add it to its shim too, or `npm run demo:build` (run in CI) fails. Keep Node APIs out of everything else that pages and route handlers import; use web APIs such as `crypto.randomUUID()` instead.

## Dependencies

- Prefer the platform: Node, the browser, React, Next.js. A new package needs one clear job and no overlap with existing ones.
- Pin exact versions and commit `package-lock.json`.
- Remove a package in the same change that removes its last use.
