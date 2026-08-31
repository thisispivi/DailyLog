import { expect, test } from "@playwright/test";

test("sign in and log a meal", async ({ page }, testInfo) => {
    const details = `Pasta 120 g · ${testInfo.project.name} · ${Date.now()}`;
    await page.goto("/login");
    await page.getByLabel("Password").fill("dailylog-e2e-password");
    await page.getByRole("button", { name: "Open DailyLog" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.getByLabel("Details").fill(details);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(details)).toBeVisible();
});
