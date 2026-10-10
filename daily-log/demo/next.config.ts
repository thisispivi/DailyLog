import { readFileSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

const root = path.resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    version: string;
};

// The demo runs the real pages and API route handlers in the browser. These
// modules touch the server (cookies, Node APIs, the SQLite file), so the demo
// build swaps each one for a browser version in ./shims.
const shims = {
    "@/core/config/env": "./shims/env.ts",
    "@/core/http/client": "./shims/http-client.ts",
    "@/core/preferences/preference-cookies": "./shims/preference-cookies.ts",
    "@/core/security/session": "./shims/session.ts",
    "@/infrastructure/database/client": "./shims/database-client.ts",
    "next/server": "./shims/next-server.ts",
};

/** A static export for GitHub Pages; see README.md in this folder. */
const config: NextConfig = {
    output: "export",
    trailingSlash: true,
    poweredByHeader: false,
    images: { unoptimized: true },
    env: { DAILYLOG_VERSION: version },
    turbopack: {
        root,
        resolveAlias: shims,
    },
};

export default config;
