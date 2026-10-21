# ADR 0002: Password-gated single-owner sessions

## Status

Accepted — 2026-08-31

## Context

Telegram previously authenticated one configured user by Telegram ID. A private web app needs browser sessions but does not need registration, password recovery, organizations, or third-party identity infrastructure.

## Decision

Authenticate one configured owner with a long environment-provided password. Issue a signed, HttpOnly, SameSite=Lax cookie bound to the configured owner ID that expires after seven idle days; the proxy reissues it at most once a day while in use. Lax rather than Strict because Chrome drops Strict cookies on the first request when an installed app is launched, which forced a new sign-in every time. Verify same-origin requests for mutations and throttle failed sign-in attempts in memory. Fail closed when authentication secrets are absent.

Continue accepting `ALLOWED_USER_ID` as a migration alias for `APP_USER_ID`, preserving ownership of existing records.

## Consequences

- Setup remains small and private; no personal identity data leaves the installation.
- Operators must terminate TLS before the app and manage password/session secrets.
- In-memory throttling is appropriate for the supported single-process deployment. A future multi-instance architecture must provide a shared limiter and session strategy.
