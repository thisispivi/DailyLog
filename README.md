# DailyLogBot

A private Telegram bot for tracking meals, training, and sleep with timestamped logs and date-range exports to XLSX or PDF.

## What it tracks

- Meals: breakfast, snack 1, snack 2, lunch, dinner, plus free text for food and grams.
- Training: activity name, start timestamp, end timestamp.
- Sleep: start timestamp, end timestamp.
- Exports: date range to XLSX or PDF, organized month by month and day by day.

The bot is designed for short messages:

```text
breakfast eggs 150g bread 80g
lunch pasta 120g chicken 200g
tennis
stop
sleep
wake
/export 2026-07-01 2026-07-31 xlsx
```

It also supports buttons for the common actions.

## Setup

1. Create a bot with Telegram BotFather and copy the token.
2. Get your Telegram numeric user ID. You can use Telegram bots like `@userinfobot`, or temporarily run the bot without `ALLOWED_USER_ID` only on a private machine and check the startup/access logs.
3. Copy the environment file:

```bash
cp .env.example .env
```

4. Fill in:

```env
BOT_TOKEN=123456:your-token
ALLOWED_USER_ID=123456789
TIMEZONE=Europe/Berlin
```

5. Run locally:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
python -m dailylogbot
```

The local SQLite database is stored at `data/dailylogbot.sqlite3` by default.

Or run with Docker:

```bash
docker compose up --build
```

The Docker SQLite database is stored in the Docker volume `dailylogbot_data`.

## Commands

```text
/start
/help
/today
/last
/delete_last
/delete 12
/export
/export pdf
/export 2026-07-01 2026-07-31 xlsx
/export 2026-07-01 2026-07-31 pdf
/edit 12 label=Lunch text=pasta 120g chicken 200g
/edit_last text=pasta 120g chicken 200g
/edit 15 start=2026-07-08 18:00 end=2026-07-08 19:30
```

Italian commands and text are also understood for the common flows:

```text
colazione uova 150g pane 80g
pranzo pasta 120g pollo 200g
dormo
sveglia
fine
```

## Compact logging rules

- Meal messages must start with a meal type.
- Any short non-meal message starts a training session when no training is active.
- `stop`, `end`, `fine`, or `finito` ends the active training.
- `sleep`, `dormo`, or `vado a dormire` starts sleep.
- `wake`, `sveglia`, or `mi sono svegliato` ends sleep.
- Direct ranges are accepted:

```text
tennis 18:00-19:30
sleep 23:30-07:10
```

For sleep ranges crossing midnight, the bot stores the start on the previous day and the end on the wake-up day.

## Exports

The Telegram keyboard has `XLSX` and `PDF` buttons. They export the current month by default.

Generated XLSX/PDF files use the monitor layout from the old tracker: two daily blocks per row, blue date headers, and rows for sleep, meals, and activity.

You can still export an explicit range:

```text
/export 2026-07-01 2026-07-31 xlsx
/export 2026-07-01 2026-07-31 pdf
```

## Development

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -e ".[dev]"
pytest
python -m dailylogbot
```
