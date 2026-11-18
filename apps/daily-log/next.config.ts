import type { NextConfig } from "next";

import packageJson from "./package.json";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(isProduction
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
] as const;

const nextConfig: NextConfig = {
    agentRules: false,
    // Shown in Settings; Release Please bumps package.json on release.
    env: { DAILYLOG_VERSION: packageJson.version },
    output: "standalone",
    poweredByHeader: false,
    async headers() {
        return [{ source: "/(.*)", headers: [...securityHeaders] }];
    },
};

export default nextConfig;
