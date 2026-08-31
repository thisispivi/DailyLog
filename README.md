<div align="center">
  <img alt="DailyLog — private meals, training, sleep, and weight journal" src="./assets/readme/dailylog-banner.png" width="100%">
</div>

# DailyLog

DailyLog is a private, bilingual web journal for meals, training, sleep, and body weight. It turns the original Telegram bot’s guided commands into faster direct forms, searchable history, recoverable editing, useful trends, and localized exports.

## Product capabilities

- Log meals with a meal type, details, and original local timestamp.
- Start or backfill training and sleep; one database-enforced activity can remain open at a time.
- End or cancel an active session from the Today screen.
- Record weight in kilograms or pounds while storing canonical integer grams.
- Browse, search, filter, edit, and delete entries and weigh-ins.
- Bulk-delete one day’s entries without touching its weigh-ins.
- Restore deleted data from a 30-day trash view.
- See today’s timeline, sleep/activity totals, weight trend, and activity-duration breakdown.
- Export any date range or all data as an editable XLSX workbook or print-ready PDF.
- Use Italian or English independently for the interface and exported reports.
- Choose light, dark, or system theme with a persisted, flash-free startup.
- Use the full product on phones, tablets, laptops, and desktops.

## Architecture

DailyLog is one production-deployable Next.js application:

```text
Browser
  ├── React Server Components → initial private views
  └── authenticated route handlers → validated mutations and downloads
                                      │
                          feature/domain modules
                                      │
                          SQLite repository adapter
                                      │
                 existing entries, weigh_ins, user_settings
```

Code is organized by product feature under `src/features`, cross-feature policy under `src/core`, transport routes under `src/app`, and vendor adapters under `src/infrastructure`. See [CODING_STANDARDS.md](docs/CODING_STANDARDS.md) and the concise [architecture decisions](docs/architecture/).

## Technology

- Node.js 20.9 or newer
- Next.js 16 and React 19
- strict TypeScript
- SQLite in WAL mode through `better-sqlite3`
- Zod runtime validation
- `write-excel-file` for small, safe XLSX output
- PDFKit for server-generated PDF reports
- Vitest and Playwright
- ESLint and Prettier

The dependency set is intentionally small. There is no ORM, client state framework, CSS framework, chart library, authentication platform, or general component library.

## Requirements

- Node.js `>=20.9`
- npm `>=10`
- A TLS-terminating reverse proxy for production
- A writable directory for the SQLite database

## Installation

```powershell
npm ci
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). DailyLog denies sign-in until `APP_PASSWORD` is configured.

## Environment configuration

```env
APP_PASSWORD=replace-with-a-long-unique-password
SESSION_SECRET=replace-with-at-least-32-random-characters
APP_USER_ID=123456789
TIMEZONE=Europe/Berlin
DATABASE_PATH=data/dailylogbot.sqlite3
LOG_LEVEL=info
```

| Variable         | Required          | Purpose                                                                                                      |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `APP_PASSWORD`   | Yes               | Single-owner sign-in password; use at least 12 characters and preferably a password manager-generated value. |
| `SESSION_SECRET` | Recommended       | Signs session cookies. When omitted, `APP_PASSWORD` is used; a distinct 32+ character value is safer.        |
| `APP_USER_ID`    | For migrated data | Owner ID used to scope every query. `ALLOWED_USER_ID` remains a supported migration alias.                   |
| `TIMEZONE`       | No                | IANA timezone for calendar days and local forms; defaults to `Europe/Berlin`.                                |
| `DATABASE_PATH`  | No                | SQLite file; defaults to `data/dailylogbot.sqlite3`.                                                         |
| `LOG_LEVEL`      | No                | `debug`, `info`, `warn`, or `error`; the former uppercase values remain accepted.                            |

Never commit `.env`, database files, generated reports, or session secrets.

## Database and migration

`npm run db:migrate` creates missing tables and applies additive schema version 4. When a pre-web database is present, DailyLog first creates a sibling backup such as:

```text
data/dailylogbot.sqlite3.pre-web-v2.bak
```

The migration preserves table names, record IDs, timestamps, soft-deletion state, user ownership, settings, and metric weight values. It adds independent report language, theme preference, and query indexes. Back up the production volume before every deployment as normal operational practice.

## Development commands

```powershell
npm run dev            # local development server
npm run db:migrate     # additive database migrations
npm run format         # format source and documentation
npm run format:check   # verify formatting
npm run lint           # ESLint, React, Next.js, and accessibility rules
npm run typecheck      # strict TypeScript
npm test               # deterministic unit and integration suite
npm run test:e2e       # Chromium desktop and mobile workflows
npm run build          # optimized standalone production build
npm run start          # run the production build
npm run quality        # formatting, lint, types, tests, and build
```

## Tests

The regression suite prioritizes behavior that mattered in the Telegram bot and trust boundaries introduced by the web app:

- schema-v2-to-v4 data preservation;
- per-owner query isolation;
- one-open-activity uniqueness;
- soft deletion and restore;
- canonical weight conversion;
- DST-aware local calendar boundaries;
- daily activity/sleep summaries;
- entry interval validation;
- spreadsheet formula neutralization;
- valid PDF and XLSX output;
- sign-in and meal logging in a real browser.

## Localization

English and Italian resources live together in `src/core/i18n/catalogs.ts`, producing typed translation keys. Components contain no workflow copy. `Intl` formats dates, times, and numbers using the saved UI locale and configured timezone. UI language, report language, and weight unit are persisted independently.

## Theme and design system

Global tokens in `src/app/globals.css` define typography, spacing, radii, surfaces, semantic colors, focus, shadows, motion, and responsive breakpoints. The visual identity reuses the original navy/electric-blue banner and robot artwork at sign-in, then reduces it to a quiet navy mark and a single blue accent inside the utility interface.

Light and dark palettes are designed separately. System mode is implemented with CSS media queries and the persisted cookie is rendered by the server, avoiding incorrect-theme flashes without startup JavaScript.

## Security model

DailyLog is a private, single-owner application—not a multi-tenant service.

- signed seven-day HttpOnly sessions;
- `SameSite=Strict` and production `Secure` cookies;
- same-origin checks on every mutation;
- login throttling;
- every database operation scoped by owner ID;
- Zod validation at request and environment boundaries;
- parameterized SQL and database constraints;
- XLSX formula-injection defense;
- CSP, HSTS in production, frame denial, MIME sniffing protection, restricted browser permissions, and safe referrer policy;
- structured request logging without journal contents or weight values;
- stable API errors without stack traces or database details;
- no public indexing or response caching of private data.

See [SECURITY.md](SECURITY.md) for deployment expectations and vulnerability reporting.

## Docker

```bash
cp .env.example .env
# Set APP_PASSWORD and SESSION_SECRET in .env, then:
docker compose up --build --detach
docker compose ps
```

Open [http://localhost:3000](http://localhost:3000). Compose persists `/data/dailylog.sqlite3` in the `dailylog_data` volume, exposes the app on port 3000, and reports container health. Database migrations are applied additively when the application first opens the database. Put HTTPS in front of the container for production.

## Production deployment

1. Provide all required environment variables through a secret manager.
2. Mount durable storage at `/data` or point `DATABASE_PATH` to another persistent path.
3. Let the application apply additive migrations on first database access, or run `npm run db:migrate` from a Node checkout before accepting traffic.
4. Run the standalone Next server behind an HTTPS reverse proxy.
5. Use one application instance while SQLite and the in-memory login limiter remain the supported architecture.
6. Back up the database and verify restore procedures regularly.
7. Monitor structured stderr/stdout logs and the process health from the hosting platform.

## Relationship to the Telegram bot

DailyLog’s original Python bot served as the functional and data-model specification. Its useful features are now available directly in the web interface; the Telegram transport and sequential wizard state have been retired to avoid duplicated business rules, dependency stacks, and localization. Git history retains the former implementation, and the pre-migration database backup provides a data rollback source.

## Repository map

```text
.
├── assets/readme/                  Original DailyLog banner
├── docs/
│   ├── architecture/               Architecture decision records
│   └── CODING_STANDARDS.md         Canonical engineering rules
├── scripts/migrate.ts              Explicit migration entry point
├── src/
│   ├── app/                        Pages, layouts, APIs, loading/error states
│   ├── core/                       Configuration, HTTP, i18n, security, time, logs
│   ├── features/                   Vertical product features and tests
│   └── infrastructure/database/    Schema migration and SQLite repository
├── tests/e2e/                      Critical browser workflows
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## License

[MIT](LICENSE)
