import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Dependency direction: app → features → core, with infrastructure as an adapter
// layer that only app routes and pages may reach. See docs/CODING_STANDARDS.md.
const restrictImports = (...patterns) => ({
    "no-restricted-imports": ["error", { patterns }],
});

const noParentImports = {
    group: ["../*"],
    message: "Use the @/ alias inside src.",
};

export default defineConfig([
    ...nextCoreWebVitals,
    ...nextTypescript,
    {
        rules: {
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { fixStyle: "inline-type-imports" },
            ],
            "no-duplicate-imports": "error",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-non-null-assertion": "error",
            eqeqeq: ["error", "always"],
        },
    },
    {
        files: ["src/**/*.{ts,tsx}"],
        rules: restrictImports(noParentImports),
    },
    {
        files: ["src/core/**/*.{ts,tsx}"],
        rules: restrictImports(noParentImports, {
            group: ["@/app/*", "@/infrastructure/*", "@/features/*/ui/*"],
            message: "core is shared policy and must not depend on routes, adapters, or UI.",
        }),
    },
    {
        files: ["src/features/**/*.{ts,tsx}"],
        rules: restrictImports(noParentImports, {
            group: ["@/app/*", "@/infrastructure/*"],
            message: "Features receive data from routes and pages; they never reach adapters.",
        }),
    },
    {
        files: ["src/infrastructure/**/*.{ts,tsx}"],
        rules: restrictImports(noParentImports, {
            group: ["@/app/*", "@/features/*/ui/*"],
            message: "Adapters must not depend on routes or UI.",
        }),
    },
    globalIgnores([
        ".next/**",
        ".venv*/**",
        "dist/**",
        "coverage/**",
        "next-env.d.ts",
        "playwright-report/**",
        "test-results/**",
    ]),
]);
