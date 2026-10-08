# Changelog

## [1.2.0](https://github.com/thisispivi/DailyLog/compare/v1.1.0...v1.2.0) (2026-10-08)


### Features

* redesign the interface around the banner identity ([8b55f76](https://github.com/thisispivi/DailyLog/commit/8b55f7683742a1be04e7f0c69f7cf9881ba1a4ff))
* redesign the interface around the banner identity ([e9c5840](https://github.com/thisispivi/DailyLog/commit/e9c584045420b1f22d75c094fa967e17bd59210a))


### Bug Fixes

* **deps:** bump brace-expansion to patch DoS advisories ([2a0dc6b](https://github.com/thisispivi/DailyLog/commit/2a0dc6b9c8a23e2400fc103c5a3f7af35cc90119))
* **deps:** bump next to 16.3.8 to patch security advisories ([607885c](https://github.com/thisispivi/DailyLog/commit/607885c9272f8ff46e552e8673aad6a03a7950ca))
* **deps:** bump sharp to 0.35.5 to patch librsvg vulnerability ([d920f2e](https://github.com/thisispivi/DailyLog/commit/d920f2ea76ae1541a4ccc38a6083ee4617a7bc2a))
* **deps:** bump source-map-js to 1.2.2 to patch DoS advisory ([4d84d82](https://github.com/thisispivi/DailyLog/commit/4d84d82bb5b6845308c34bfdc9673f7a35e81ce4))
* **deps:** replace vulnerable fast-glob in eslint plugin with tinyglobby ([2eaf0d5](https://github.com/thisispivi/DailyLog/commit/2eaf0d5b48fbff9d45c3cd5843f417296ff3e61d))

## [1.1.0](https://github.com/thisispivi/DailyLog/compare/v1.0.0...v1.1.0) (2026-09-01)

### Features

- add Gitleaks configuration for secret detection ([93539d9](https://github.com/thisispivi/DailyLog/commit/93539d9ba942d920773cbfe984d5a9f82a0e3ad8))
- **bot:** streamline backdated logging and edits ([492c7d3](https://github.com/thisispivi/DailyLog/commit/492c7d3d5f115735367107e39b937b1e9d77b831))
- **localization:** enhance Italian language support and document export settings ([aec5aba](https://github.com/thisispivi/DailyLog/commit/aec5aba08e94727d747bf4a6601573cfd6a9235b))
- **web:** replace Telegram bot with DailyLog app ([07aa18b](https://github.com/thisispivi/DailyLog/commit/07aa18beaae340ef83a69079e5b5d1c92de041e7))

### Bug Fixes

- **ci:** keep release pull requests buildable ([68dbcd3](https://github.com/thisispivi/DailyLog/commit/68dbcd39e4e945a233287768fa4d69024fcecce3))
- **ci:** keep release pull requests buildable ([a6821a8](https://github.com/thisispivi/DailyLog/commit/a6821a83f94ec72765eecd17283d27108bee794c))
- **ci:** restore secure pull request checks ([#33](https://github.com/thisispivi/DailyLog/issues/33)) ([05484d8](https://github.com/thisispivi/DailyLog/commit/05484d899de38a88147e9a60acfff947ea7d3e49))
- sync lockfile version for release ([b8becd9](https://github.com/thisispivi/DailyLog/commit/b8becd9e953d7fabffdb10834fb34c284f246322))

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
