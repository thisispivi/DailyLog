# Notes for coding agents

Read [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) first. It is the source of truth for structure, validation, and style.

Application paths below are relative to `daily-log/`; run npm commands there.

Key points:

- API routes go through `authenticatedRoute` / `publicRoute` and parse input with `readJson` / `readQuery` and a strict Zod schema from the owning feature.
- Only `src/app` may import `src/infrastructure`. ESLint enforces the import direction.
- Every repository query takes and filters by `userId`.
- Add UI strings to `src/core/i18n/catalogs.ts` in English and Italian together.
- Before finishing, run `npm run quality`. Do not bypass the git hooks.
- Commits use Conventional Commits. Branches are named `<kind>/<short-description>`.
