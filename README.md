# DailyLog

DailyLog is a private Telegram bot for recording meals, training, sleep, and personal exports. It is designed around short guided flows so each interaction has one clear next step.

## Guided experience

The bot reads the Telegram interface language at `/start` and presents English or Italian buttons and messages. English is the fallback for every other language code.

The idle keyboard is intentionally small:

- `🍽 Add meal`
- `🏃 Start training`
- `😴 Start sleep`
- `📅 Today`, `🕘 Last`, and `📤 Export`

Every guided step includes an emoji, a step number where useful, and a `✖ Cancel` button. `/cancel` works as well.

### Meals

1. Choose `🍽 Add meal`.
2. Choose breakfast, snack 1, lunch, snack 2, or dinner.
3. Send the food and quantities, for example `pasta 120g chicken 200g`.

The bot confirms the saved entry and restores the main keyboard.

### Training and sleep

1. Choose `🏃 Start training`, then select a suggestion (`🚶 Walk`, `🏃 Run`, `🏋️ Gym`, `🎾 Tennis`, or `🏓 Table tennis`) or write any activity name.
2. The bot saves the start and shows only `⏹ End training` and `✖ Cancel`.

Sleep starts immediately from `😴 Start sleep` and shows only `⏹ End sleep` and `✖ Cancel`.

There can be exactly one open training or sleep activity per user. While one is open, every other flow and command is blocked. Ending it records the end time; cancelling it removes the unfinished entry. You can start and complete training or sleep as many times as you need in the same day.

### Exports

The export flow is always the same:

1. Choose `📤 Export`.
2. Choose `📊 XLSX` or `📄 PDF`.
3. Choose `🗂 All data` or `📆 Date range`.
4. For a range, send two dates: `2026-07-01 2026-07-31`.

`All data` finds the first and final saved entries automatically. Empty exports are not generated.

The XLSX export has a new monthly-report layout: a dark header, colour-coded summary cards, clear date sections, a readable detail table, filters, and print settings. The PDF uses the same visual language with a report header/footer, monthly summary cards, and grouped activity tables. User-entered text is stored as literal text in XLSX exports and safely escaped in PDFs.

## Quick text entries

The buttons are the recommended experience. These compact entries remain available when no activity is open:

```text
lunch pasta 120g chicken 200g
pranzo pasta 120g pollo 200g
tennis 18:00-19:30
sleep 23:30-07:10
/export 2026-07-01 2026-07-31 pdf
```

`sleep 23:30-07:10` is stored across midnight correctly. A short activity name such as `tennis` also starts a training session while the bot is idle.

## Commands

```text
/start
/help
/today
/last
/cancel
/end
/stop
/delete_last
/delete 12
/export
/export 2026-07-01 2026-07-31 xlsx
/edit 12 label=Lunch text=pasta 120g chicken 200g
/edit_last text=pasta 120g chicken 200g
```

`/export` opens the guided export flow. The fully specified `/export` command is available for quick use. `/end` and `/stop` end the one open training or sleep activity.

## Setup

1. Create a Telegram bot using BotFather and copy its token.
2. Find your numeric Telegram user ID.
3. Copy the environment template and fill in the values.

```powershell
Copy-Item .env.example .env
```

```env
BOT_TOKEN=123456:your-token
ALLOWED_USER_ID=123456789
TIMEZONE=Europe/Berlin
DATABASE_PATH=data/dailylogbot.sqlite3
LOG_LEVEL=INFO
```

4. Create a virtual environment, install the package, run tests, then start the bot.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
pytest
python -m dailylogbot
```

Docker is also supported:

```bash
docker compose up --build
```

The container maps the SQLite database to the durable Docker volume `dailylogbot_data`.

## Architecture and safeguards

- `handlers.py` owns the guided state machine and Telegram interaction boundary.
- `parser.py` provides side-effect-free parsing for compact input and edit fields.
- `db.py` is the only persistence boundary. It uses parameterized SQL, foreign-key checks, WAL mode, a busy timeout, soft deletion, validation, and a database-level partial unique index that prevents concurrent open activities.
- `exporters.py` keeps report generation separate from bot transport and sanitizes spreadsheet control characters, formula-like user text, and PDF markup.
- `i18n.py` contains all localized user-facing strings and semantic button mapping.

The token is never logged. `ALLOWED_USER_ID` is mandatory and every handler verifies it before accessing data. Database queries are scoped by that user ID, including edit and delete operations.

Production modules and tests use docstrings rather than inline code comments.

## Development

Run the complete regression suite:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

The suite covers parser rules, database invariants, export safety and report structure, emoji-driven meal/training workflows, the open-activity lock, and the complete export wizard.
