import { describe, expect, it } from "vitest";

import { entryDisplayLabel } from "@/features/logbook/entry-label";

describe("entryDisplayLabel", () => {
    it("translates the labels stored by the bot", () => {
        expect(entryDisplayLabel({ kind: "meal", label: "Snack 1" }, "it")).toBe("Spuntino 1");
        expect(entryDisplayLabel({ kind: "sleep", label: "Sleep" }, "it")).toBe("Sonno");
    });

    it("keeps labels the user typed", () => {
        expect(entryDisplayLabel({ kind: "training", label: "Padel" }, "it")).toBe("Padel");
        expect(entryDisplayLabel({ kind: "meal", label: "Brunch" }, "it")).toBe("Brunch");
    });
});
