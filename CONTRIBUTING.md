# Contributing to DailyLog

## Prerequisites

- Git
- Node.js 20.9 or newer
- npm 10 or newer

## Local setup

```powershell
npm ci
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

Use a disposable database path for development when production-like data is not required. Never commit `.env`, database files, backups, journal content, exports, or session cookies.

## Engineering rules

Read [CODING_STANDARDS.md](docs/CODING_STANDARDS.md) before changing architecture, security, persistence, localization, or UI. Keep changes inside the owning feature and add English and Italian strings together.

## Validation

Run the complete local gate before opening a pull request:

```powershell
npm run quality
npm audit --audit-level=moderate
```

Run `npm run test:e2e` when a user workflow, responsive layout, authentication, form, navigation, or theme changes. Run `npm install` after dependency changes and commit `package-lock.json`.

## Pull requests

Create a focused branch and use a Conventional Commit title such as `feat: add report filter` or `fix: preserve local day at DST`. Describe the user-visible outcome, migration/operational impact, security impact, and commands actually run. Include deterministic tests for behavior changes and screenshots only when they materially help review UI changes.

## Merge policy

Protect `main` with the quality and browser CI jobs, required resolved conversations, up-to-date branches, linear history, and blocked force pushes. Require CODEOWNERS review when the maintainer team can satisfy it without blocking emergency security work.
