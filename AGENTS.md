# Notes for coding agents

Read [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) first. It is the source of truth for structure, validation, and code style.

For any UI, styling, chart, copy, or export change, also read [docs/DESIGN.md](docs/DESIGN.md). It defines how DailyLog looks and behaves: tokens, components, layouts, and interaction rules.

Application paths below are relative to `daily-log/`; run npm commands there.

Key points:

- API routes go through `authenticatedRoute` / `publicRoute` and parse input with `readJson` / `readQuery` and a strict Zod schema from the owning feature.
- Only `src/app` may import `src/infrastructure`. ESLint enforces the import direction.
- Every repository query takes and filters by `userId`.
- Add UI strings to `src/core/i18n/catalogs.ts` in English and Italian together.
- Use the design system: tokens instead of literal colours, `data-kind` for record-type colours, and the shared `Select`, `DateTimeField`, and `Sheet` instead of native controls or custom modals.
- Before finishing, run `npm run quality`. Do not bypass the git hooks.
- Commits use Conventional Commits. Branches are named `<kind>/<short-description>`.

Project skills in `.claude/skills/` hold the step-by-step workflows: `check` (definition of done and failure diagnosis), `add-api-endpoint`, and `change-database-schema`.
