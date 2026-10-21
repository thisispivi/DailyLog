<div align="center">
  <img alt="DailyLog: meals, training, sleep, and weight in one private journal" src="./assets/readme/dailylog-banner.svg" width="100%">
</div>

# DailyLog

A private, single-owner web journal for meals, training, sleep, and body weight. English and Italian, light and dark, phone to desktop.

It replaced an earlier Telegram bot and still reads that bot's SQLite database.

**Try it:** [demo.dailylog.pivi.dev](https://demo.dailylog.pivi.dev) runs the real app in your browser with sample data. Nothing leaves the browser, and any password signs you in. See [daily-log/demo/README.md](daily-log/demo/README.md).

## What it does

- Log meals, training, sleep, and weigh-ins from one **Add record** sheet, now or backdated. The meal type, last activity, and last weight are prefilled.
- See the day on **Today**: totals per record type, a timeline, the running activity, and your logging streak.
- Run one training or sleep session at a time, then end or cancel it from **Today**.
- Search, filter, edit, and delete records in **History**. Deleted records stay in the trash for 30 days.
- See a 7-day summary, 14 nights of sleep, 30 days of training, and your full weight history in **Reports**, and export any range as XLSX or PDF.
- Browse past days in **Calendar** and keep a note for any day.
- Track BMI and a weight goal on **Profile**, and generate a weekly **Meal plan** from your diet.
- Back up the account to a JSON file and import it again from **Settings**.
- Choose UI language, report language, theme (light, dark, or system), weight unit (kg or lb), and 12- or 24-hour time separately.

## Quick start

Requires Node.js 22.12+ and npm 10+.

```bash
cd daily-log
npm ci
cp .env.example .env    # then set APP_PASSWORD and SESSION_SECRET
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Sign-in stays disabled until `APP_PASSWORD` is set.

`npm ci` also installs the git hooks (see [Quality checks](#quality-checks)).

## Configuration

All variables are validated with Zod in [`src/core/config/env.ts`](daily-log/src/core/config/env.ts) when the server starts. Invalid values stop startup with the variable name, never its value.

| Variable          | Default                    | Notes                                                                     |
| ----------------- | -------------------------- | ------------------------------------------------------------------------- |
| `APP_PASSWORD`    | none                       | Required to sign in. 12 to 256 characters. Settings can change it later.  |
| `SESSION_SECRET`  | `APP_PASSWORD` (dev only)  | Signs session cookies. 32+ characters. Required in production.            |
| `APP_USER_ID`     | `1`                        | Owner ID on every row. Set it to the old Telegram user ID when migrating. |
| `ALLOWED_USER_ID` | none                       | The bot's name for `APP_USER_ID`. Still accepted.                         |
| `TIMEZONE`        | `Europe/Berlin`            | IANA zone used for calendar days and form times.                          |
| `DATABASE_PATH`   | `data/dailylogbot.sqlite3` | SQLite file. The directory is created if missing.                         |
| `LOG_LEVEL`       | `info`                     | `debug`, `info`, `warn`, or `error`. Uppercase bot values also work.      |
| `BUGSINK_DSN`     | none                       | Bugsink project DSN. When set, unexpected server errors are reported.     |

## Architecture

The application, its dependencies, tests, build configuration, and Dockerfile live in `daily-log/`. Repository documentation, GitHub workflows, and Git hooks stay at the root. Run npm commands from `daily-log/`. See the [changelog](daily-log/CHANGELOG.md) for releases.

One Next.js 16 app with a SQLite database. No ORM, no client state library, no CSS framework. Charts use Recharts.

```text
daily-log/src/
├── app/              Routes: pages, layouts, API route handlers
├── features/<name>/  Product features: domain logic, schemas, feature UI
├── ui/               Shared presentational pieces: logo, record-type icons, Sheet, Select, DateTimeField, toast
├── core/<concern>/   Cross-cutting policy: config, http, i18n, observability, preferences, security, time
└── infrastructure/   Adapters. Today only the SQLite database
```

- Pages are Server Components that read from the repository directly. Client components only handle interaction.
- Every API route is wrapped in `authenticatedRoute` or `publicRoute` from [`src/core/http/api.ts`](daily-log/src/core/http/api.ts). The wrapper checks the origin and session and maps errors to a single envelope: `{ error: { code, message, requestId, fields? } }`. `readJson` and `readQuery` parse input with the route's Zod schema.
- [`LogbookRepository`](daily-log/src/infrastructure/database/logbook-repository.ts) scopes every query by owner ID. The database also enforces the important rules: one open activity, valid ranges, and weight bounds.

ESLint enforces the import direction. The full rules are in [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md), and the design system (colours, components, layouts, copy, exports) is in [docs/DESIGN.md](docs/DESIGN.md).

## Runtime validation

Zod validates every input that crosses a trust boundary, once, before it reaches domain code:

| Boundary                              | Schema                                                                                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request bodies, queries, route params | The owning feature's `schemas.ts`, e.g. [`logbook`](daily-log/src/features/logbook/schemas.ts), [`auth`](daily-log/src/features/auth/schemas.ts), [`profile`](daily-log/src/features/profile/schemas.ts) |
| Backup import                         | [`src/features/backup/schemas.ts`](daily-log/src/features/backup/schemas.ts), built from the request schemas                                                                                             |
| Environment                           | [`src/core/config/env.ts`](daily-log/src/core/config/env.ts)                                                                                                                                             |
| Session cookie payload                | [`src/core/security/session.ts`](daily-log/src/core/security/session.ts)                                                                                                                                 |
| Locale and theme cookies              | [`src/core/preferences/preference-cookies.ts`](daily-log/src/core/preferences/preference-cookies.ts)                                                                                                     |

Request schemas reject unknown keys. Larger contracts are composed from smaller ones instead of repeating fields: a backup file is validated with the same entry, settings, and profile schemas the API uses. TypeScript types for validated input come from `z.infer`, so there is no hand-written copy to drift. Relational rows are not re-parsed because the schema's `CHECK` constraints already guarantee their shape. JSON documents stored in the database (diet, meal plan) are parsed with their Zod schemas when read.

## Quality checks

From `daily-log/`:

```bash
npm run format:check   # Prettier
npm run lint           # ESLint, including import boundaries
npm run typecheck      # strict TypeScript
npm test               # Vitest unit and SQLite integration tests
npm run test:e2e       # Playwright, desktop and mobile Chromium
npm run build          # production build
npm run quality        # everything above except e2e
```

Git hooks in `.githooks/` run automatically:

- **pre-commit**: Prettier and ESLint on staged files.
- **pre-push**: format check, lint, typecheck, and unit tests.

CI runs the same checks plus the demo build, Playwright, `npm audit`, a Trivy container scan with a health check, and a Gitleaks history scan.

## Database

`npm run db:migrate` creates or upgrades the schema and prints the resulting version. The app also migrates on first database access. Migrations are additive.

Before upgrading an older database, DailyLog copies it next to the original as `<file>.pre-web-v<old version>.bak`, for example `data/dailylogbot.sqlite3.pre-web-v2.bak`.

## Docker

From the repository root:

```bash
cp daily-log/.env.example daily-log/.env    # set APP_PASSWORD and SESSION_SECRET
docker compose up --build --detach
```

Compose publishes the app on http://localhost:14141 and keeps the database in the `dailylog_data` volume at `/data/dailylog.sqlite3`.

For production:

- Put an HTTPS reverse proxy in front. Over plain HTTP, Chrome flags every PDF and Excel export as an insecure download; the only fix is serving the app over HTTPS. On a home network, `tailscale serve 14141` or a Caddy proxy with a real domain both work.
- Run a single instance. SQLite and the in-memory login limiter assume one process.
- Back up the volume and test restores.

See [SECURITY.md](SECURITY.md) for the deployment baseline.

## Security model

- One owner, one password. Sessions are signed, HttpOnly, and `SameSite=Lax`, and expire after seven idle days (renewed at most once a day while in use).
- Set `SESSION_SECRET`. In production the server refuses to start without it when `APP_PASSWORD` is set. In development, sessions fall back to being signed with `APP_PASSWORD`, which a password change in Settings does not rotate, and the server logs `config.session_secret_is_password`.
- Pages redirect to sign-in without a valid session, checked in the proxy before anything renders. Every mutating request must come from the same origin.
- Failed sign-ins are throttled per client (8 per 15 minutes) and globally (60 per 15 minutes). The global cap also blocks the owner's sign-in while it lasts; existing sessions keep working.
- SQL is always parameterized. Exported spreadsheet cells are protected against formula injection.
- CSP, HSTS (in production), frame denial, and `nosniff` are set in [`next.config.ts`](daily-log/next.config.ts).
- Logs are structured JSON and never contain journal text, weights, passwords, or cookies.

## License

[MIT](LICENSE)
