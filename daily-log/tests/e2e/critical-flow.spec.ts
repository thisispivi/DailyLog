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
    // The toast fades out on its own before it is removed.
    await expect(page.locator(".toast")).toHaveCSS("animation-name", "toast-in, toast-out");
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

test.describe("sheet", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/login");
        await page.getByLabel("Password").fill("dailylog-e2e-password");
        await page.getByRole("button", { name: "Open DailyLog" }).click();
        await expect(page).toHaveURL(/\/today$/);
    });

    test("animates out before closing and returns focus", async ({ page }) => {
        const tile = page.getByRole("button", { name: /^Meals:/ });
        await tile.click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();

        const exit = await sheet.evaluate(async (dialog) => {
            dialog.querySelector<HTMLButtonElement>(".sheet-header button")?.click();
            await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            return dialog
                .getAnimations()
                .map((animation) => (animation as CSSAnimation).animationName);
        });
        expect(exit).toContain("sheet-out");
        await expect(sheet).toBeHidden();
        await expect(tile).toBeFocused();

        // Escape takes the same animated path, and the sheet opens again afterwards.
        await tile.click();
        await expect(sheet).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(tile).toBeFocused();
    });

    test("closes at once under reduced motion", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.getByRole("button", { name: /^Meals:/ }).click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        const isOpen = await sheet.evaluate(async (dialog) => {
            dialog.querySelector<HTMLButtonElement>(".sheet-header button")?.click();
            await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            return (dialog as HTMLDialogElement).open;
        });
        expect(isOpen).toBe(false);
    });

    test("date popover enters from its side, fades out, and returns focus", async ({ page }) => {
        await page.getByRole("button", { name: /^Meals:/ }).click();
        const trigger = page.getByRole("dialog").locator("#record-start");
        await trigger.click();
        const popover = page.locator(".date-popover");
        await expect(popover).toHaveAttribute("data-side", /bottom|top/);

        const exit = await popover.evaluate(async (node) => {
            node.querySelector<HTMLButtonElement>(".time-row .button-primary")?.click();
            await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            return node
                .getAnimations()
                .map((animation) => (animation as CSSAnimation).animationName);
        });
        expect(exit).toContain("pop-out");
        await expect(popover).toHaveCount(0);
        await expect(trigger).toBeFocused();
    });

    test("a range end opens on the start day", async ({ page }) => {
        await page.getByRole("button", { name: /^Active:/ }).click();
        const sheet = page.getByRole("dialog");
        // A closing popover stays mounted while it fades out.
        const popover = page.locator('.date-popover[data-state="open"]');

        // Log something from another day: today's neighbour in the same month.
        await sheet.locator("#record-start").click();
        const today = Number(await popover.locator(".rdp-today").innerText());
        const day = String(today === 1 ? 2 : today - 1);
        await popover
            .locator(".rdp-day:not(.rdp-outside) button")
            .filter({ hasText: new RegExp(`^${day}$`) })
            .click();
        await popover.getByRole("button", { name: "Done" }).click();
        const startDay = (await sheet.locator('input[name="startAt"]').inputValue()).slice(0, 10);

        await sheet.locator("#record-end").click();
        await expect(popover.locator(".rdp-selected")).toHaveText(day);
        await popover.getByLabel("Hours").fill("23");
        await popover.getByLabel("Minutes").fill("30");
        await popover.getByRole("button", { name: "Done" }).click();
        await expect(sheet.locator('input[name="endAt"]')).toHaveValue(`${startDay}T23:30`);
    });
});
