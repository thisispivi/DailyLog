import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
        key: "Content-Security-Policy",
        value: [
            "default-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
            "connect-src 'self'",
            "object-src 'none'",
        ].join("; "),
    },
    ...(isProduction
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
] as const;

const nextConfig: NextConfig = {
    agentRules: false,
    output: "standalone",
    // The PDF export embeds Nunito from node_modules; the files are read at runtime,
    // so they must be traced into the standalone build explicitly.
    outputFileTracingIncludes: {
        "/api/reports/export": [
            "./node_modules/@fontsource/nunito/files/nunito-latin-{400,700,800}-normal.woff",
        ],
    },
    poweredByHeader: false,
    experimental: {
        optimizePackageImports: ["lucide-react"],
    },
    async headers() {
        return [{ source: "/(.*)", headers: [...securityHeaders] }];
    },
};

export default nextConfig;
