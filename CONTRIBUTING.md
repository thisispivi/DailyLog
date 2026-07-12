# Contributing to DailyLog

## Prerequisites

- Git
- Python 3.12
- [uv](https://docs.astral.sh/uv/)

## Local setup

```powershell
uv python install 3.12
uv sync --locked
Copy-Item .env.example .env
uv run pre-commit install --install-hooks
```

The installed hooks format Python files, sort imports, run strict type checking, check dependency usage and import cycles, scan for dead code and secrets, validate the lockfile, compile the package, and run the complete unit suite. Do not bypass them; CI runs the same mandatory gates.

## Daily commands

```powershell
uv run pre-commit run --all-files
uv run pytest -q --cov=dailylogbot --cov-report=term-missing
uv run mypy
uv lock --check
```

Run `uv lock` after changing dependencies and commit the resulting `uv.lock`. The repository has no generated documentation site; docstrings are validated directly by the quality gate.

## Pull requests

Create a focused branch, make conventional commits such as `feat: add export filter` or `fix: preserve timezone`, and open a pull request against `main`. Include tests for behavior changes and explain any user-visible or operational impact. Do not include `.env`, bot tokens, database files, exports, or other user data.

## Maintainer merge policy

Protect `main` with required CI checks (`Validate environment and lockfile`, `Quality gates`, `Strict type checking`, `Tests and coverage`, `Python 3.13 compatibility`, `Build package`, `Dependency security`, and `Secret scan`), one approving review, required CODEOWNERS review, resolved conversations, up-to-date branches, linear history, and blocked direct pushes and force pushes. Require signed commits when every regular contributor can use verified signing; otherwise enable vigilant mode and introduce signing after documenting the migration. A sole owner should add a second maintainer before enabling a mandatory approval rule that would block all solo merges.
