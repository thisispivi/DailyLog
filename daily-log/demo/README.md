# DailyLog demo

A playable copy of DailyLog for GitHub Pages, served at [demo.dailylog.pivi.dev](https://demo.dailylog.pivi.dev).

It is not a mock-up: the static export runs the app's real pages and API route handlers in the browser, against the real repository and migrations on SQLite compiled to WebAssembly ([sql.js](https://github.com/sql-js/sql.js)). A fictional person's six weeks of records are seeded on the first visit, and every change is saved in `localStorage`, so it survives reloads but never leaves the browser. **Reset demo** starts over.

## How it fits together

- `next.config.ts` builds a static export and aliases the modules that need a server (environment, cookies, the session, the HTTP client, the SQLite file, `next/server`) to the browser versions in `shims/`.
- `shell/demo-app.tsx` opens the database, calls the real page component for the current route, and renders it again after every change, as `router.refresh()` does in the app.
- `shell/api.ts` answers `sendJson` calls, download links, and the export form with the real route handlers. PDF and XLSX exports need Node, so the demo says they are not available.
- `shell/seed.ts` writes the sample data through `LogbookRepository`.

## Commands

Run from `daily-log/`:

```bash
npm run demo:dev
```

```bash
npm run demo:build
```

`demo:build` writes `demo/out`, including `CNAME` and `.nojekyll`. CI builds it on every pull request; the Release workflow builds it for every release and deploys it as a GitHub Pages artifact. GitHub Pages must use GitHub Actions as its deployment source. Run the Release workflow manually to redeploy from `main` without creating a release or a deployment branch.
