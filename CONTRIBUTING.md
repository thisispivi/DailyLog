# Contributing

## Setup

```bash
cd daily-log
npm ci                  # installs dependencies and the git hooks
cp .env.example .env    # set APP_PASSWORD and SESSION_SECRET
npm run db:migrate
npm run dev
```

Point `DATABASE_PATH` at a throwaway file when you don't need real data. Never commit `.env`, databases, backups, or exports.

Read [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) before your first change. It says where new code goes and what lint enforces.

## Workflow

1. Branch from `main` as `<kind>/<short-description>`, e.g. `feat/weekly-summary` or `fix/dst-day-bounds`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`.
3. Open a pull request against `main`. Its title becomes the release note, so use the same format.
4. Merge once CI is green, then delete the branch.

Release Please turns merged commits into the changelog and version bump.

## Checks

The hooks run automatically:

- **pre-commit**: Prettier and ESLint on staged files.
- **pre-push**: format check, lint, typecheck, unit tests.

Run the full local gate from `daily-log/` before opening a pull request:

```bash
npm run quality
npm run test:e2e    # when a user workflow, layout, or form changes
```

If a hook fails, fix the cause. Don't skip it with `--no-verify`.

## Pull requests

Say what changed for the user, any migration or security impact, and which commands you ran. Include a regression test for bug fixes. Screenshots help for UI changes.
