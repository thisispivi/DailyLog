---
name: check
description: Run DailyLog's definition of done and diagnose failures. Use before saying a change is finished, before a commit or pull request, when a git hook or CI job fails, or when asked to "run the checks", "run quality", or "make CI green".
---

# Check

The definition of done is `npm run quality` (AGENTS.md, CONTRIBUTING.md), plus `npm run test:e2e` when a user workflow, layout, or form changed. CI (`.github/workflows/ci.yml`) also runs `npm audit --audit-level=low`, `npm run demo:build`, a Docker build with a Trivy scan, and a Gitleaks history scan.

Run everything from `daily-log/`. Use the installed dependencies; don't run `npm install` or touch `package-lock.json` just to get checks running.

## Order

`npm run quality` runs these in order and stops at the first failure. Run them one by one when you need every result:

1. `npm run format:check`: Prettier over the whole repository (`prettier --check ..`), using `../.prettierignore`.
2. `npm run lint`: ESLint, `--max-warnings=0`. Also enforces the import direction and `@/` imports.
3. `npm run typecheck`: `tsc --noEmit` for the app, then `tsc --noEmit -p demo`.
4. `npm test`: Vitest, `src/**/*.test.ts` only (see `vitest.config.ts`).
5. `npm run build`: production Next.js build into `.next/`.

Then, as the change requires:

6. `npm run demo:build`: when you touched anything a page or API route imports, or a module listed in `demo/next.config.ts`. CI runs it on every PR.
7. `npm run test:e2e`: Playwright, desktop and mobile Chromium (`playwright.config.ts`). It starts `npm run dev` on port 3000 with its own throwaway `data/dailylog-e2e.sqlite3`, and reuses a server already on port 3000 outside CI. Needs the Chromium build that matches the installed `@playwright/test`. After a Playwright upgrade the run fails in a few milliseconds with `Executable doesn't exist at ...ms-playwright\chromium_headless_shell-<build>`; that's the environment, and `npx playwright install chromium` fixes it (it downloads a browser, so ask first).
8. `npm audit --audit-level=low`: needs network access to the npm registry.

Record the test count from Vitest's summary line (`Tests  N passed`) before and after your change. A lower count with no deleted tests means a file stopped being collected.

## Don't run

- `docker compose up` or anything that touches a real database. `npm run db:migrate` migrates whatever `DATABASE_PATH` points at (default `data/dailylogbot.sqlite3`, which may be the owner's real journal). Point `DATABASE_PATH` at a throwaway file if you need it.
- The release workflow or anything that deploys the demo.
- `--no-verify` to skip a failing hook. Fix the cause.

The Docker, Trivy, and Gitleaks jobs only run in CI. Say so rather than claiming them.

## Diagnosing failures

- **format:check**: run `npm run format` and review the diff. It writes every file Prettier owns, so check that only your files changed. The repo is LF everywhere (`.gitattributes`, `.editorconfig`); a CRLF file on Windows shows up here.
- **lint, `no-restricted-imports`**: an import crosses the boundaries in docs/CODING_STANDARDS.md ("Import direction") or uses `../`. Move the code or import from the owning module; don't add an eslint-disable.
- **typecheck, demo project only**: a module swapped in `demo/next.config.ts` gained an export its shim in `demo/shims/` lacks. Add it to the shim.
- **test**: run one file with `npx vitest run <path>`. Repository tests use an in-memory database through `migrateDatabase`, so a schema change shows up there first.
- **build or demo:build**: a Node API (`node:fs`, `node:crypto`, ...) reached code that pages or route handlers import. Use the web API instead (CODING_STANDARDS.md, "Demo").
- **Unexpected diff in `next-env.d.ts`**: `next dev` (which e2e starts) rewrites its imports to `./.next/dev/types/...`; `next build` writes `./.next/types/...`, the committed form. It's a side effect of the check, not your change. Restore it with `git checkout -- next-env.d.ts`.
- **e2e**: a stale dev server on port 3000 serves old code to Playwright locally. Stop it, or run with `CI=1` to force a fresh server.

## Environment versus code

It's an environment problem, not your change, when: the same command fails on a clean `main`; `node_modules` is missing (`npm ci` fixes it, but that reinstalls, so ask); Playwright reports a missing browser; `npm audit` can't reach the registry; or port 3000 is taken. Report these as not run, with the reason, and never as passing.

## When you're done

Rerun every check that was affected, in the order above, and compare pass/fail and the test count with the run before your change. Report the exact commands and any check you skipped and why.
