import { describe, expect, it } from "vitest";

import { translate } from "@/core/i18n/translate";

describe("translate", () => {
    it("picks the singular or plural form from count", () => {
        expect(translate("it", "dashboard.streak", { count: 1 })).toBe("1 giorno di fila");
        expect(translate("it", "dashboard.streak", { count: 5 })).toBe("5 giorni di fila");
        expect(translate("en", "history.results", { count: 1 })).toBe("1 record");
        expect(translate("en", "history.results", { count: 0 })).toBe("0 records");
    });

    it("interpolates named values", () => {
        expect(translate("en", "dashboard.activeFor", { duration: "5 min" })).toBe(
            "Active for 5 min",
        );
    });
});
