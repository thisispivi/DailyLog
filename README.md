<div align="center">
   <div style="display: flex;padding-block:20px;margin-bottom:20px;background-color:#061b44">
      <img alt="DailyLog banner" src="./assets/readme/dailylog-banner.png" width="100%">
   </div>
</div>

# [DailyLog](https://github.com/thisispivi/DailyLog)

DailyLog is a private, single-user Telegram journal for meals, training, sleep, body weight, and clean personal reports. It is designed around guided conversations: every action has one clear next step, and open activities are safely protected from conflicting commands.

## What It Does

- Uses the user's Telegram language only on first use, then saves interface language, document language, and weight unit independently in Settings; every user-facing label and message lives in JSON locale files.
- Records meals in a two-step flow: choose the meal type, then write the food and quantities.
- Records training in a guided activity picker with walk, run, gym, tennis, and table-tennis suggestions, while accepting any custom activity name.
- Starts and ends sleep or training sessions, with one database-enforced open activity at a time and unrestricted repeated sessions in a day.
- Records body weight through a one-step flow. Values can use a decimal point or comma, are stored only as metric grams, and are displayed in the saved kg/lb preference.
- Lets the user choose Today or up to eight recent record dates to edit or delete entries and weigh-ins, bulk-delete one day's entries, and restore records from Trash for 30 days.
- Exports any date range or all saved data as a localized XLSX monthly report or print-ready PDF; document language is saved independently in Settings.
- Keeps convenient text input available when idle, including `lunch pasta 120g`, `tennis 18:00-19:30`, and `sleep 23:30-07:10`.

## Stack

![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?style=for-the-badge&logo=python&logoColor=white) ![Telegram](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white) ![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?style=for-the-badge&logo=sqlite&logoColor=white) ![uv](https://img.shields.io/badge/uv-261230?style=for-the-badge&logo=uv&logoColor=white) ![Testing](https://img.shields.io/badge/Tests-pytest-0A9EDC?style=for-the-badge&logo=pytest&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

The application uses `python-telegram-bot`, SQLite, `openpyxl`, and ReportLab. Locale catalogs are standard JSON resources packaged with the Python module.

## Guided Workflow

1. Send `/start`. DailyLog seeds the saved locale from the Telegram interface language and shows the idle keyboard.
2. Select an action: `🍽 Add meal`, `🏃 Start training`, `😴 Start sleep`, `⚖️ Weigh in`, `📅 Today`, `🕘 Last`, `🗂 Manage data`, `📤 Export`, or `⚙️ Settings`.
3. For a meal, choose breakfast, snack 1, lunch, snack 2, or dinner, then send the meal details.
4. For training, choose a suggestion or type an activity. For sleep, the session starts immediately.
5. While training or sleep is open, the keyboard contains only the matching end control and `✖ Cancel`. Other commands and text entries are rejected until the activity is ended or cancelled.
6. For a weigh-in, enter a positive number in the saved unit; Settings can switch between kg and lb without modifying saved readings.
7. Manage data offers Today plus eight recent dates containing the selected record type, while still accepting any typed ISO date (`YYYY-MM-DD`). It then supports field-level editing, deletion confirmation, and Trash restore.
8. Set the document language once in Settings. For an export, choose `📊 XLSX` or `📄 PDF`, then choose `🗂 All data` or `📆 Date range`. A date range uses `YYYY-MM-DD YYYY-MM-DD`.

`/cancel` works at every guided step. Cancelling an open activity moves it to Trash; records in Trash are recoverable for 30 days.

Use `/delete_day` to choose a date, or `/delete_day YYYY-MM-DD` as a shortcut. The bot shows the affected entry count and asks for confirmation; weigh-ins are left unchanged, and each deleted entry remains recoverable from Trash.

## Reports

Both export formats use chronological day sections and a monthly body-weight summary when readings exist. PDF uses a compact four-column layout with localized activity/meal labels and activity duration folded into Details.

- XLSX creates a polished worksheet for each month with print settings, frozen headers, filters, readable wrapped details, and safe literal handling for spreadsheet-formula-like user input.
- PDF creates a print-ready A4 report with a first-page title and date range, repeated table headers, compact rows, a page-number-only footer, and escaped user text.

## Repository

```text
.
├── assets
│   └── readme
│       └── dailylog-banner.png
├── src
│   └── dailylogbot
│       ├── application     Framework-independent logbook use cases
│       ├── config.py       Runtime configuration and validation
│       ├── db.py           SQLite repository and data invariants
│       ├── exporters.py    XLSX and PDF report generation
│       ├── handlers.py     Telegram boundary and guided state machine
│       ├── i18n.py         JSON catalog loader and localization helpers
│       ├── keyboards.py    Semantic reply-keyboard builders
│       ├── locales          English and Italian JSON catalogs
│       └── parser.py       Side-effect-free compact input parsing
├── tests                   Parser, database, export, i18n, and workflow tests
├── Dockerfile
├── docker-compose.yml
└── pyproject.toml
```

## Local Development

DailyLog uses [uv](https://docs.astral.sh/uv/) and a committed lockfile for reproducible development environments.

```powershell
uv python install 3.12
uv sync --locked
Copy-Item .env.example .env
uv run pre-commit install --install-hooks
uv run pytest -q
uv run python -m dailylogbot
```

Set the following values in `.env` before starting the bot:

```env
BOT_TOKEN=123456:your-token
ALLOWED_USER_ID=123456789
TIMEZONE=Europe/Berlin
DATABASE_PATH=data/dailylogbot.sqlite3
LOG_LEVEL=INFO
TELEGRAM_NETWORK_TIMEOUT_SECONDS=10
TELEGRAM_CONNECTION_POOL_SIZE=8
```

`ALLOWED_USER_ID` is required; the bot rejects all other Telegram users.

## Docker

```bash
docker compose up --build
```

The Compose configuration stores SQLite data in the durable `dailylogbot_data` volume. The image installs only the runtime dependency set from `uv.lock`.

## Runtime Operations

DailyLog processes updates sequentially to keep the guided conversation state deterministic. SQLite work and XLSX/PDF generation run in worker threads, so they do not block Telegram's asyncio event loop. Telegram HTTP clients are long-lived, bounded by the configured timeout and connection-pool values, and are closed by the framework during graceful polling shutdown.

The database normalizes existing aware ISO timestamps to UTC and migrates existing installations to schema version 3 at startup. Migrations preserve current entries, weigh-ins, and preferences; version 3 adds an independent document-language setting initialized from the saved interface language. Back up the SQLite volume before deploying any production upgrade as normal operational practice.

## Commands

```text
/start                 Show the localized home keyboard
/help                  Explain the guided workflow
/today                 List today’s entries
/last                  Show the latest entry
/cancel                Cancel the current wizard or open activity
/end or /stop          End the open training or sleep activity
/export                Open the export workflow
/export <from> <to> pdf
/weighin               Open the weigh-in flow
/manage                Open entry and weigh-in management
/settings              Change saved language or weight unit
/delete_last
/delete <id>
/delete_day [YYYY-MM-DD]
/edit <id> key=value
/edit_last key=value
```

The edit commands support `label=`, `text=`, `start=`, `end=`, and `kind=`. Use local timestamps such as `start=2026-07-08 12:30`. Guided entry editing separates the date (`YYYY-MM-DD`) from start and optional end clocks (`HH:MM`) and stays open for consecutive changes.

## Security and Data Design

- Bot tokens are read from environment variables and are never logged.
- Every handler and every database query is scoped to the configured user ID.
- SQLite uses parameterized statements, foreign keys, WAL mode, a busy timeout, soft deletion with 30-day recovery, and a partial unique index for the single-open-activity rule.
- Entry validation limits untrusted label and text sizes, while export code neutralizes XLSX formula injection and PDF markup injection.
- Production modules use docstrings for API documentation; there are no inline implementation comments.

## Quality Checks

```powershell
uv run pre-commit run --all-files
uv lock --check
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run lint-imports
uv run deptry .
uv run vulture src tests --min-confidence 80
uv run interrogate --fail-under 100 src
uv run pytest -q --cov=dailylogbot --cov-report=term-missing
uv run python -m compileall -q src
uv export --locked --all-groups --no-emit-project --output-file "$env:TEMP\requirements-audit.txt"
uv run pip-audit --strict --requirement "$env:TEMP\requirements-audit.txt"
uv tree --locked --all-groups --outdated
```

Pre-commit runs the formatter, Ruff with import sorting, strict mypy, import-cycle and dependency checks, dead-code and documentation checks, compilation, secret detection, lock validation, Conventional Commit validation, and the complete unit suite. The test job enforces 67% branch coverage. GitHub Actions runs the same gates in parallel, audits dependencies, reports available updates, scans the full Git history for secrets, and builds a distribution artifact.

The regression suite covers parsing, persisted localization, metric weight conversion, trash retention, database ownership and temporal invariants, localized report generation, guided correction flows, stale keyboard input, and the open-activity command lock. See [CONTRIBUTING.md](CONTRIBUTING.md) for the merge policy and [SECURITY.md](SECURITY.md) for private vulnerability reporting. Releases and changelog entries are generated by Release Please from Conventional Commit messages.
