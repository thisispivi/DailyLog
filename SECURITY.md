# Security policy

## Supported versions

Security fixes go to the current `main` branch and the latest release.

## Reporting a vulnerability

Do not open a public issue. Report it through GitHub's private vulnerability reporting for this repository, with the affected version, the impact, steps to reproduce, and any mitigation you suggest. Leave out real passwords, session cookies, database contents, journal details, and exported reports.

## Deployment baseline

DailyLog is a private application with a single owner. A production operator must:

- set a unique `APP_PASSWORD` of 12 or more characters and a different `SESSION_SECRET` of 32 or more characters through a secret manager. In production the server refuses to start when `APP_PASSWORD` is set without `SESSION_SECRET`;
- keep the existing owner ID with `APP_USER_ID` when migrating data;
- keep the application port on loopback (the Compose default) and terminate HTTPS in a reverse proxy on the same host;
- have that proxy overwrite `X-Forwarded-For` with the client address, because the per-client sign-in limit is keyed on it; forward `X-Forwarded-Proto`, so cookies are marked `Secure`; and preserve `Host` (or send `X-Forwarded-Host`), because the same-origin check compares against it;
- expose the service only to the networks and users it is meant for;
- mount the SQLite database on durable storage with restrictive filesystem permissions;
- back up the database and test restoring it;
- run one application instance, because SQLite and the in-memory login limiter assume a single process;
- apply dependency and application updates promptly;
- run `npm audit` and `npm run quality` from `daily-log/` before deploying;
- keep structured operational logs without collecting private journal data.

DailyLog has no public registration, password recovery, multi-user tenancy, cloud sync, or encrypted-at-rest database storage. Use disk or volume encryption when your threat model needs it.
