import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    reporter: "list",
    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
    },
    webServer: {
        command: "npm run dev",
        env: {
            APP_PASSWORD: "dailylog-e2e-password",
            DATABASE_PATH: "data/dailylog-e2e.sqlite3",
            SESSION_SECRET: "dailylog-e2e-session-secret-at-least-32-characters",
        },
        url: "http://localhost:3000/login",
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile", use: { ...devices["Pixel 7"] } },
    ],
});
