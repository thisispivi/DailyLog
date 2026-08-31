# Changelog

## 1.0.0 (2026-08-31)

### Features

- replace the Telegram interaction model with a responsive authenticated web application;
- add direct logging and backdating for meals, training, sleep, and weigh-ins;
- add searchable history, inline editing, bulk day deletion, and 30-day trash restore;
- add useful weight/activity trends and localized XLSX/PDF reports;
- add independent English/Italian UI and report languages;
- add designed light, dark, and system themes using the original DailyLog visual identity.

### Engineering

- move active product code to strict TypeScript, Next.js, React, and SQLite;
- preserve legacy records through an additive v4 migration and automatic pre-web backup;
- add signed sessions, same-origin mutation checks, login throttling, secure headers, structured logging, and runtime validation;
- add Vitest/Playwright coverage, Node-based CI, Docker deployment, architecture records, and canonical coding standards.

## [0.5.0](https://github.com/thisispivi/DailyLog/compare/v0.4.1...v0.5.0) (2026-07-13)

### Features

- **localization:** enhance Italian language support and document export settings ([aec5aba](https://github.com/thisispivi/DailyLog/commit/aec5aba08e94727d747bf4a6601573cfd6a9235b))

## [0.4.1](https://github.com/thisispivi/DailyLog/compare/v0.4.0...v0.4.1) (2026-07-13)

### Bug Fixes

- sync lockfile version for release ([b8becd9](https://github.com/thisispivi/DailyLog/commit/b8becd9e953d7fabffdb10834fb34c284f246322))

## [0.4.0](https://github.com/thisispivi/DailyLog/compare/v0.3.0...v0.4.0) (2026-07-12)

### Features

- add Gitleaks configuration for secret detection ([93539d9](https://github.com/thisispivi/DailyLog/commit/93539d9ba942d920773cbfe984d5a9f82a0e3ad8))

### Documentation

- **readme:** add DailyLog banner ([43f58c1](https://github.com/thisispivi/DailyLog/commit/43f58c1b605be47081fd7d055777d49a6000b9ef))
- **readme:** add DailyLog banner ([95da369](https://github.com/thisispivi/DailyLog/commit/95da36957cc0ccd05e86bc5973e1232500772957))

## Changelog

All notable changes to DailyLog are documented here.

Release Please generates release pull requests and updates this file from Conventional Commit messages.
