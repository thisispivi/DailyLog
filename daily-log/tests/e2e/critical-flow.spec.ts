import { expect, test } from "@playwright/test";

test("signed-out page requests never render, even as a client navigation", async ({ request }) => {
    // RSC: 1 asks for the page segment alone, without the layout that also checks the session.
    for (const headers of [{}, { RSC: "1" }]) {
        const response = await request.get("/today", { headers, maxRedirects: 0 });
        expect(response.status()).toBe(307);
        expect(response.headers().location).toMatch(/\/login$/);
    }
});

test("sign in and log a meal straight from its Today tile", async ({ page }, testInfo) => {
    const details = `Pasta 120 g · ${testInfo.project.name} · ${Date.now()}`;
    await page.goto("/login");
    await page.getByLabel("Password").fill("dailylog-e2e-password");
    await page.getByRole("button", { name: "Open DailyLog" }).click();
    await expect(page).toHaveURL(/\/today$/);

    await page.getByRole("button", { name: /^Meals:/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Details").fill(details);
    await sheet.getByRole("button", { name: "Add", exact: true }).click();

    await expect(sheet).toBeHidden();
    await expect(page.getByText(details)).toBeVisible();
});

test("signing in restores the saved language and theme", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("dailylog-e2e-password");
    const [login] = await Promise.all([
        page.waitForResponse("**/api/auth/login"),
        page.getByRole("button", { name: "Open DailyLog" }).click(),
    ]);
    await expect(page).toHaveURL(/\/today$/);

    const { data } = await (await page.request.get("/api/settings")).json();
    const cookies = await login.headerValues("set-cookie");
    expect(cookies).toContainEqual(expect.stringMatching(`^dailylog_locale=${data.locale};`));
    expect(cookies).toContainEqual(expect.stringMatching(`^dailylog_theme=${data.theme};`));
    await expect(page.locator("html")).toHaveAttribute("lang", data.locale);
});

test("busy controls keep their spinner under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    const button = page.getByRole("button", { name: "Open DailyLog" });
    await button.evaluate((node) => node.setAttribute("aria-busy", "true"));
    const spinner = await button.evaluate(
        (node) => getComputedStyle(node, "::before").animationName,
    );
    expect(spinner).toBe("spin");
});
