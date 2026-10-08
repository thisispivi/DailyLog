import { expect, test } from "@playwright/test";

test("sign in and log a meal from the add sheet", async ({ page }, testInfo) => {
    const details = `Pasta 120 g · ${testInfo.project.name} · ${Date.now()}`;
    await page.goto("/login");
    await page.getByLabel("Password").fill("dailylog-e2e-password");
    await page.getByRole("button", { name: "Open DailyLog" }).click();
    await expect(page).toHaveURL(/\/today$/);

    await page.getByRole("button", { name: "Add record" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Meal" }).click();
    await sheet.getByLabel("Details").fill(details);
    await sheet.getByRole("button", { name: "Add", exact: true }).click();

    await expect(sheet).toBeHidden();
    await expect(page.getByText(details)).toBeVisible();
});
