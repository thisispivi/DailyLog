// Public build facts, not runtime configuration: the version is inlined from
// package.json at build time (next.config.ts), so it always matches the release.
export const APP_VERSION = process.env.DAILYLOG_VERSION ?? "dev";

export const REPOSITORY_URL = "https://github.com/thisispivi/DailyLog";
export const AUTHOR_URL = "https://linktree.pivi.dev/";
