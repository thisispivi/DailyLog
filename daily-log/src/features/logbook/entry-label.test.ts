import { describe, expect, it } from "vitest";

import { entryDisplayLabel, loneSnackIds } from "@/features/logbook/entry-label";

describe("entryDisplayLabel", () => {
    it("translates the labels stored by the bot", () => {
        expect(entryDisplayLabel({ kind: "meal", label: "Snack 1" }, "it")).toBe("Spuntino 1");
        expect(entryDisplayLabel({ kind: "sleep", label: "Sleep" }, "it")).toBe("Sonno");
    });

    it("keeps labels the user typed", () => {
        expect(entryDisplayLabel({ kind: "training", label: "Padel" }, "it")).toBe("Padel");
        expect(entryDisplayLabel({ kind: "meal", label: "Brunch" }, "it")).toBe("Brunch");
    });

    it("drops the number only when a day has a single snack", () => {
        const snack = (id: number, label: string, startAt: string) =>
            ({ id, kind: "meal", label, startAt }) as const;
        const entries = [
            snack(1, "Snack 2", "2026-10-08T14:00:00+00:00"),
            snack(2, "Snack 1", "2026-10-09T09:00:00+00:00"),
            snack(3, "Snack 2", "2026-10-09T15:00:00+00:00"),
        ];
        const lone = loneSnackIds(entries, "Europe/Rome");
        const labels = entries.map((entry) => entryDisplayLabel(entry, "en", lone));
        expect(labels).toEqual(["Snack", "Snack 1", "Snack 2"]);
    });
});
