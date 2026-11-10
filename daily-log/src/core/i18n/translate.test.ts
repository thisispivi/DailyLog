import { describe, expect, it } from "vitest";

import { formatNumber, numberStyle, translate } from "@/core/i18n/translate";

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

describe("formatNumber", () => {
    it("writes the separators of each style and groups from 1,000 up", () => {
        const options = { maximumFractionDigits: 1 };
        expect(formatNumber(1234.5, "comma-dot", options)).toBe("1,234.5");
        expect(formatNumber(1234.5, "dot-comma", options)).toBe("1.234,5");
        expect(formatNumber(1234.5, "space-comma", options)).toBe("1 234,5");
        expect(formatNumber(1234.5, "apostrophe-dot", options)).toBe("1’234.5");
        expect(formatNumber(-0.5, "dot-comma", options)).toBe("-0,5");
    });

    it("follows the interface language on auto", () => {
        expect(numberStyle("it", "auto")).toBe("dot-comma");
        expect(numberStyle("en", "auto")).toBe("comma-dot");
        expect(numberStyle("it", "space-comma")).toBe("space-comma");
    });
});
