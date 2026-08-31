# DailyLog Coding Standards

## Purpose

This document is the canonical engineering standard for DailyLog. New code must preserve the product’s private, single-owner model, bilingual interface, data compatibility, and direct daily-use experience.

## Architecture and boundaries

- Organize product code by feature under `src/features/<feature>`. A feature owns its domain types, schemas, UI, application logic, and tests.
- Put cross-feature policy in `src/core` only when at least two features consume it. Keep security, time, i18n, HTTP contracts, configuration, and observability in named core modules; never create a catch-all `utils` directory.
- Put framework and vendor adapters in `src/infrastructure`. Domain and feature modules must not import Next.js or SQLite types unless they are explicitly transport or persistence code.
- Keep route handlers thin: authenticate, validate, call one repository/application operation, and serialize a stable result.
- Do not import from another feature’s UI directory. Shared domain imports must come from the owning feature’s public domain or schema module.
- Avoid barrel files. Import from the file that owns the symbol so dependencies remain visible.
- Do not add repository patterns, factories, dependency containers, or generic abstractions until two concrete implementations need the boundary.

## Folder organization

```text
src/
├── app/                         Next.js routes and route handlers
├── core/<concern>/              Cross-feature policy
├── features/<feature>/          Domain, application logic, UI, and tests
└── infrastructure/<adapter>/    SQLite and other external adapters
```

Place a test beside the source it protects using `*.test.ts`. Browser workflows live in `tests/e2e`.

## Naming and files

- Use `kebab-case.ts` and `kebab-case.tsx` filenames.
- Use `PascalCase` for React components and exported types; use `camelCase` for functions and values.
- Name booleans as facts or capabilities: `isOpen`, `hasActiveActivity`, `canRestore`.
- Name handlers by outcome: `finishActivity`, not `handleThing`.
- Name constants in `UPPER_SNAKE_CASE` only when they are module-level invariants.
- Keep files focused. Split a file when it contains multiple unrelated reasons to change, not at an arbitrary line count.

## TypeScript

- `strict` mode is mandatory. Do not weaken `tsconfig.json` checks to accommodate application errors.
- Do not use `any`. Prefer `unknown`, then narrow it at the trust boundary.
- Do not use non-null assertions. Prove the value exists or return a controlled error.
- Avoid casts. A cast is acceptable only after runtime validation or when correcting an incomplete third-party declaration; keep it local and explain the constraint when non-obvious.
- Prefer `type` for domain values, unions, and component props. Use `interface` for intentionally extensible third-party boundaries.
- Model finite domain states with literal unions or discriminated unions, never free-form strings.
- Prefer `readonly` domain records and readonly component props.
- Let Zod infer boundary input types. Do not duplicate a schema as a handwritten request type.
- Use exhaustive `switch` handling for discriminated unions. An unhandled domain variant must fail type checking.

## Components and hooks

- Server Components are the default. Add `"use client"` only for interaction, browser APIs, or local transient state.
- Keep data access in server pages or route handlers; client components receive serializable domain values.
- Components must expose semantic HTML before ARIA. Add ARIA only when native semantics do not express the interaction.
- Every input has a programmatic label. Every mutation exposes pending, success, and failure feedback.
- Do not use effects to derive state that can be computed while rendering.
- Name reusable hooks `use<Capability>`. A hook must own a coherent behavior, not merely wrap one `useState` call.
- Avoid prop drilling across more than two product layers. Prefer composition before introducing context.

## Services, repositories, and API conventions

- Exported domain services describe a user-visible capability and remain independent of Next.js.
- Repository methods always take `userId`; no record query may rely on a previously selected global owner.
- Route handlers use the response envelope `{ data: T }` or `{ error: { code, message, requestId, fields? } }`.
- Use conventional HTTP methods and statuses. Return `400` for invalid input, `401` for no session, `403` for rejected origin/authorization, `404` for unavailable owned records, `409` for invariant conflicts, and `429` for throttling.
- Parse pagination with a maximum server-enforced limit. Never accept a raw SQL sort column or clause from the client.
- Do not expose stack traces, SQLite errors, secrets, filesystem paths, or internal exception messages.

## Validation and errors

- Treat request bodies, query parameters, environment variables, cookies, database rows, and imported files as untrusted.
- Validate external input with Zod before it reaches domain or persistence code.
- Encode invariants twice when appropriate: readable application validation plus database constraints/indexes for race safety.
- Use stable error codes for client decisions. Translate user-facing error text at the UI boundary.
- Catch only errors that can be converted, recovered, or enriched. Never use an empty catch block.
- Destructive actions require a clear confirmation and remain recoverable when the domain supports it.

## Logging and observability

- Log structured JSON through `core/observability/logger.ts`.
- Use event names such as `auth.login_rejected` and include request IDs on request-scoped events.
- Never log passwords, session tokens, cookies, request bodies, meal details, weight values, or report contents.
- Health checks and external error tracking must be added behind narrow adapters. Do not couple domain code to a vendor SDK.

## Security

- Mutating HTTP requests require a valid signed session and same-origin verification.
- Cookies are `HttpOnly`, `SameSite=Strict`, path-scoped, and `Secure` in production.
- Authentication must fail closed when secrets are absent or invalid.
- Use parameterized SQLite statements. Never interpolate user values into SQL identifiers or clauses.
- Never render user content as HTML. Spreadsheet-bound text must pass formula-injection neutralization.
- Secrets belong in environment variables. Commit placeholders only.
- Keep CSP, HSTS, frame denial, content-type protection, referrer policy, and permissions policy enabled.
- Run `npm audit --audit-level=moderate` before releases and address direct or exploitable advisories.

## Accessibility

- Meet a practical WCAG 2.2 AA baseline: keyboard operation, visible focus, semantic landmarks/headings, sufficient contrast, and 44px touch targets.
- Use `aria-live` for asynchronous status changes. Do not move focus unexpectedly.
- Dialogs, if introduced, must trap focus, close with Escape, label themselves, and return focus to the trigger.
- Respect `prefers-reduced-motion`; motion must communicate state, not decorate empty space.

## Internationalization

- No user-facing component string may be hardcoded. Add English and Italian strings to `core/i18n/catalogs.ts` in the same change.
- Use typed translation keys and named interpolation tokens.
- Format dates, times, numbers, and weights with `Intl` using the saved locale and configured timezone.
- Persist UI language separately from report language. New locale support must not require component changes.
- Error, validation, loading, empty, accessibility-label, notification, and metadata text are part of localization scope.

## Styling and design tokens

- Use the tokens defined in `app/globals.css` for color, spacing, radius, elevation, sizing, focus, and layout.
- Do not introduce raw colors in feature CSS unless they extend the documented DailyLog navy/blue brand treatment or a contained chart series.
- Maintain one dominant focal mass per screen, restrained accent use, matte surfaces, and localized detail density.
- Do not create equal-card grids, decorative gradients, glass effects, filler badges, or ornamental animation.
- Design mobile layouts intentionally; do not merely scale the desktop layout.

## State, fetching, and caching

- Keep transient form state local. Persist only domain records and explicit user preferences.
- Fetch initial private data on the server. Use API requests for mutations, then refresh the affected server-rendered slice.
- Do not add a client state library until shared client state becomes demonstrably difficult with React primitives.
- Private responses and generated reports use `no-store`; never cache one user’s data in a public cache.
- Optimistic updates are allowed only when reversal is unambiguous and persistence conflicts are unlikely.

## Database and transactions

- Store timestamps as aware UTC ISO strings and derive calendar boundaries with the configured IANA timezone.
- Store body weight as integer grams; conversion is presentation/input behavior.
- Every query includes `user_id`, including updates, deletes, restores, and lookup-by-ID.
- Schema changes are additive migrations. Back up a legacy database before its first migration and increment `PRAGMA user_version`.
- Use transactions for multi-statement invariants and bulk changes.
- Add indexes only for observed query shapes; document uniqueness and partial indexes as domain rules.
- Never silently reinterpret, truncate, or delete existing records during a migration.

## Async code and performance

- Await every promise or deliberately detach it with explicit error handling.
- Run independent work concurrently only when ordering is irrelevant.
- Keep client bundles small: prefer platform APIs and Server Components; justify each client dependency.
- Paginate unbounded history. Avoid per-record queries and client-side downloads of the full database.
- Do not memoize cheap calculations. Measure before adding caches.

## Environment variables

- Validate variables in `core/config/env.ts`; application code must not read secret variables directly.
- Update `.env.example` and README for every new variable.
- Required production secrets must not have insecure defaults. Missing auth configuration must deny access.
- Preserve documented legacy aliases only when they allow safe data migration.

## Testing

- Unit tests protect domain transformations and validation.
- Integration tests use a real in-memory SQLite database for ownership, constraints, migrations, and trash behavior.
- Report tests verify file signatures and injection defenses.
- End-to-end tests protect sign-in and one critical logging flow at desktop/mobile breakpoints.
- Name tests as behavior statements. Keep them deterministic by injecting times or using fixed timestamps.
- Do not assert implementation details, framework-generated class names, or incidental markup.
- `npm test` must pass before merge. Run `npm run test:e2e` when UI workflows change.

## Documentation

- Use TSDoc (`/** ... */`) for exported domain services, public APIs, security-sensitive logic, important types, complex transformations, and non-obvious side effects.
- Start with intent, then document constraints, invariants, errors, or side effects. Do not restate syntax.
- Use `@param`, `@returns`, and `@throws` only when they add information not clear from types.
- Inline comments explain why a decision exists; they must not narrate the following statement.
- Project documents use sentence-case headings, concise paragraphs, and the terms entry, weigh-in, activity, owner, UI language, and report language consistently.

## Dependencies and imports

- Prefer Node, browser, React, and Next.js platform capabilities before adding a package.
- Every dependency must have one clear job, current maintenance, usable TypeScript declarations, and no overlapping package already present.
- Pin direct dependency versions and commit `package-lock.json`.
- Use `@/` for imports within `src`; use relative imports only from scripts outside `src`.
- Keep imports ordered by formatter/linter rules: platform, external, blank line, internal.
- Remove packages in the same change that removes their final use.

## Quality gates and Git hygiene

- Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before merging.
- CI must also run `npm audit --audit-level=moderate` and the browser regression workflow where supported.
- Use focused conventional commits. Do not combine unrelated formatting or generated artifacts with feature changes.
- Never commit `.env`, databases, backups, build output, coverage, or editor state.
- Do not leave dead code, commented-out code, debug logging, unexplained TODOs, or stale compatibility adapters.
- Do not abstract a single use “for later.” Duplicate small presentation code once; extract it when the shared rule is proven.
- Domain invariants—ownership, open activity, timestamp rules, weight normalization, retention—must have one authoritative implementation and database enforcement where possible.
