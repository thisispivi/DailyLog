import { describe, expect, it } from "vitest";

import { ageOn, bmiCategory, bodyMassIndex, fullName } from "@/features/profile/profile";
import { updateProfileSchema } from "@/features/profile/schemas";

describe("profile", () => {
    it("counts a year of age only once the birthday has passed", () => {
        expect(ageOn("1990-10-10", "2026-10-09")).toBe(35);
        expect(ageOn("1990-10-10", "2026-10-10")).toBe(36);
        expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    });

    it("computes BMI and its WHO category", () => {
        expect(bodyMassIndex(73_200, 180)).toBe(22.6);
        expect(bmiCategory(18.4)).toBe("underweight");
        expect(bmiCategory(22.6)).toBe("healthy");
        expect(bmiCategory(25)).toBe("overweight");
        expect(bmiCategory(30)).toBe("obese");
    });

    it("joins only the names that are set", () => {
        expect(fullName({ birthDate: null, firstName: "Ada", heightCm: null, lastName: "" })).toBe(
            "Ada",
        );
    });

    it("accepts partial changes and clearing, and rejects bad values", () => {
        expect(updateProfileSchema.parse({ firstName: "  Ada " })).toEqual({ firstName: "Ada" });
        expect(updateProfileSchema.parse({ birthDate: null, heightCm: null })).toEqual({
            birthDate: null,
            heightCm: null,
        });
        expect(updateProfileSchema.safeParse({}).success).toBe(false);
        expect(updateProfileSchema.safeParse({ heightCm: 20 }).success).toBe(false);
        expect(updateProfileSchema.safeParse({ birthDate: "2999-01-01" }).success).toBe(false);
        expect(updateProfileSchema.safeParse({ nickname: "x" }).success).toBe(false);
    });
});
