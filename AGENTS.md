# Agent instructions

Read [CODING_GUIDELINES.md](CODING_GUIDELINES.md) first. It is the source of truth for structure, validation, and code style.

For any UI, styling, chart, copy, or export change, also read [docs/DESIGN.md](docs/DESIGN.md). It defines how DailyLog looks and behaves: tokens, components, layouts, and interaction rules.

Application paths below are relative to `daily-log/`; run npm commands there.

Key points:

- API routes go through `authenticatedRoute` / `publicRoute` and parse input with `readJson` / `readQuery` and a strict Zod schema from the owning feature.
- Only `src/app` and `src/proxy.ts` may import `src/infrastructure`. ESLint enforces the import direction.
- Every repository query takes and filters by `userId`.
- Add UI strings to `src/core/i18n/catalogs.ts` in English and Italian together.
- Use the design system: tokens instead of literal colours, `data-kind` for record-type colours, and the shared `Select`, `DateTimeField`, and `Sheet` instead of native controls or custom modals.
- Before finishing, run `npm run quality`. Do not bypass the git hooks.

Project skills in `.claude/skills/` hold the step-by-step workflows: `check` (definition of done and failure diagnosis), `add-api-endpoint`, `change-database-schema`, and `fix-vulnerabilities`.

Never commit `.env`, databases, backups, or exports. Point `DATABASE_PATH` at a throwaway file when you don't need real data.

## Versioning and releases

`daily-log/package.json` holds the version, and it is what triggers a release. When
CI passes on `main` and that version has no tag yet, the Release workflow tags
it, publishes the GitHub release with generated notes, and deploys the demo at <https://demo.dailylog.pivi.dev/>. Nobody
releases by hand, and nothing is committed back to `main`.

Every change that reaches `main` bumps the version in the same pull request,
following [Semantic Versioning](https://semver.org/):

| Bump  | When                                                                           | Commit type                                  |
| ----- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| major | Breaking: removed or renamed behavior, config, API, or data users must migrate | `feat!:` or a `BREAKING CHANGE:` footer      |
| minor | A new user-visible feature                                                     | `feat:`                                      |
| patch | A fix, performance work, refactor, or dependency update                        | `fix:`, `perf:`, `refactor:`, `chore(deps):` |
| none  | Docs, tests, CI, or agent configuration only                                   | `docs:`, `test:`, `ci:`, `chore:`            |

- Compare against the last tag (`git describe --tags --abbrev=0`) and pick
  the highest bump the change needs. Bump once per pull request.
- Never create tags, GitHub releases, or changelog entries yourself.
- The pull request title is the release note. The "Version bump" check fails
  when code changes without a bump, unless the title type is `docs`, `test`,
  `ci`, `style`, `build`, or `chore` (but not `chore(deps)`).

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/). Name
  branches `<type>/<short-description>`.
- The repository owner is the only author. Never add `Co-Authored-By`
  trailers, "Generated with" lines, or any other attribution to commits or pull
  requests.
- Do not bypass git hooks or CI checks.

## Security

Dependabot alerts and security updates are on. To triage and fix them, use the
`fix-vulnerabilities` skill in `.claude/skills/fix-vulnerabilities/`.
