# Security policy

## Supported versions

Security fixes are applied to the current `main` branch and latest release.

## Reporting a vulnerability

Do not open a public issue. Use GitHub’s private vulnerability reporting for this repository and include the affected version, impact, reproduction steps, and any suggested mitigation. Avoid including real passwords, session cookies, database contents, journal details, or exported reports.

## Deployment baseline

DailyLog is a private, single-owner application. A production operator must:

- set a unique 12+ character `APP_PASSWORD` and distinct 32+ character `SESSION_SECRET` through a secret manager. the server refuses to start in production when `APP_PASSWORD` is set without `SESSION_SECRET`;
- preserve the existing owner ID with `APP_USER_ID` when migrating data;
- terminate HTTPS before the application and forward `X-Forwarded-Proto`, so cookies are marked `Secure`, and preserve `Host` (or send `X-Forwarded-Host`), because the same-origin check compares against it;
- expose the service only to intended networks/users;
- mount the SQLite database on durable storage with restrictive filesystem permissions;
- back up the database and test restoration;
- run one application instance, because SQLite and the in-memory login limiter assume a single process;
- apply dependency and application updates promptly;
- run `npm audit` and `npm run quality` from `daily-log/` before deployment;
- retain structured operational logs without collecting private journal data.

DailyLog does not provide public registration, password recovery, multi-user tenancy, cloud synchronization, or encrypted-at-rest database storage. Use disk or volume encryption when the threat model requires it.
