import { describe, expect, it } from "vitest";

import { generateWeek, mondayOf, rerollMeal, shoppingList } from "@/features/meal-plan/meal-plan";
import { dietPrompt } from "@/features/meal-plan/prompt";
import { type Diet, dietSchema, type MealPlan } from "@/features/meal-plan/schemas";

/** A trimmed version of a real Italian diet. */
const diet: Diet = dietSchema.parse({
    meals: [
        {
            key: "breakfast",
            variants: [
                {
                    id: "classica",
                    name: "Classica",
                    slots: [
                        { name: "Bevanda", optionIds: ["latte", "yogurt"] },
                        { name: "Base", optionIds: ["fette", "pane"] },
                    ],
                },
                {
                    id: "cornetto",
                    maxPerWeek: 1,
                    name: "Cornetto",
                    slots: [{ name: "Cornetto", optionIds: ["cornetto"] }],
                },
                {
                    id: "porridge",
                    maxPerWeek: 2,
                    name: "Porridge",
                    slots: [{ name: "Porridge", optionIds: ["porridge"] }],
                },
            ],
        },
        ...(["snack1", "snack2"] as const).map((key) => ({
            key,
            variants: [
                {
                    id: `spuntino-${key}`,
                    name: "Spuntino",
                    slots: [{ name: "Spuntino", optionIds: ["mela", "pera", "noci", "yogurt"] }],
                },
            ],
        })),
        {
            key: "lunch",
            variants: [
                {
                    id: "pranzo",
                    name: "Pranzo",
                    slots: [
                        { name: "Proteine", optionIds: ["pollo", "pesce", "legumi", "manzo"] },
                        { name: "Carboidrati", optionIds: ["pasta", "riso"] },
                    ],
                },
            ],
        },
        {
            key: "dinner",
            variants: [
                {
                    id: "cena",
                    name: "Cena",
                    slots: [
                        { name: "Proteine", optionIds: ["pollo", "pesce", "legumi", "manzo"] },
                        { name: "Frutta", optional: true, optionIds: ["mela", "pera"] },
                    ],
                },
                { id: "cena-libera", maxPerWeek: 1, name: "Cena libera", slots: [] },
            ],
        },
    ],
    name: "Dieta di prova",
    notes: ["Verdure a volontà a pranzo e cena."],
    options: [
        { id: "latte", items: [{ amount: 200, food: "Latte", unit: "ml" }], name: "Latte" },
        { id: "yogurt", items: [{ amount: 125, food: "Yogurt", unit: "g" }], name: "Yogurt" },
        {
            id: "fette",
            items: [{ amount: 4, food: "Fette biscottate", unit: "pcs" }],
            name: "Fette",
        },
        { id: "pane", items: [{ amount: 50, food: "Pane", unit: "g" }], name: "Pane" },
        { id: "cornetto", items: [{ food: "Cornetto" }], name: "Cornetto" },
        {
            id: "porridge",
            items: [
                { amount: 40, food: "Fiocchi d'avena", unit: "g" },
                { amount: 200, food: "Latte", unit: "ml" },
            ],
            name: "Porridge",
        },
        {
            id: "mela",
            items: [{ amount: 1, food: "Mela", unit: "pcs" }],
            maxPerDay: 2,
            name: "Mela",
        },
        {
            id: "pera",
            items: [{ amount: 1, food: "Pera", unit: "pcs" }],
            maxPerDay: 2,
            name: "Pera",
        },
        {
            id: "noci",
            items: [{ amount: 30, food: "Noci", unit: "g" }],
            maxPerWeek: 3,
            name: "Noci",
        },
        { id: "pollo", items: [{ amount: 150, food: "Pollo", unit: "g" }], name: "Pollo" },
        { id: "pesce", items: [{ amount: 150, food: "Pesce", unit: "g" }], name: "Pesce" },
        { id: "legumi", items: [{ amount: 80, food: "Legumi", unit: "g" }], name: "Legumi" },
        {
            id: "manzo",
            items: [{ amount: 120, food: "Manzo", unit: "g" }],
            name: "Manzo",
            weight: 0.3,
        },
        { id: "pasta", items: [{ amount: 80, food: "Pasta", unit: "g" }], name: "Pasta" },
        { id: "riso", items: [{ amount: 80, food: "Riso", unit: "g" }], name: "Riso" },
    ],
    version: 1,
});

/** A small seeded generator, so failures can be reproduced. */
function seeded(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

const picksOf = (plan: MealPlan, day?: number) =>
    plan.days
        .filter((_, index) => day === undefined || index === day)
        .flatMap((entry) => entry.meals.flatMap((meal) => meal.picks.map((pick) => pick.optionId)));
const variantsOf = (plan: MealPlan) =>
    plan.days.flatMap((day) => day.meals.map((meal) => meal.variantId));
const times = (values: readonly unknown[], value: unknown) =>
    values.filter((candidate) => candidate === value).length;
const protein = (plan: MealPlan, day: number, key: "dinner" | "lunch") =>
    plan.days[day]?.meals.find((meal) => meal.key === key)?.picks[0]?.optionId;

function expectWithinLimits(plan: MealPlan) {
    expect(plan.days).toHaveLength(7);
    expect(picksOf(plan)).not.toContain(null);
    expect(times(variantsOf(plan), "cornetto")).toBeLessThanOrEqual(1);
    expect(times(variantsOf(plan), "porridge")).toBeLessThanOrEqual(2);
    expect(times(variantsOf(plan), "cena-libera")).toBeLessThanOrEqual(1);
    expect(times(picksOf(plan), "noci")).toBeLessThanOrEqual(3);
    for (let day = 0; day < 7; day += 1) {
        const picks = picksOf(plan, day);
        expect(times(picks, "mela")).toBeLessThanOrEqual(2);
        expect(times(picks, "pera")).toBeLessThanOrEqual(2);
        expect(times(picks, "yogurt")).toBeLessThanOrEqual(1);
        const dinner = protein(plan, day, "dinner");
        if (dinner && plan.days[day]?.meals.at(-1)?.variantId === "cena") {
            expect(dinner).not.toBe(protein(plan, day, "lunch"));
        }
    }
}

describe("meal plan generator", () => {
    it("keeps every weekly and daily limit across many weeks", () => {
        for (let seed = 1; seed <= 200; seed += 1) {
            const plan = generateWeek(diet, "2026-10-05", seeded(seed));
            expect(plan.startDate).toBe("2026-10-05");
            expect(plan.days[0]?.meals.map((meal) => meal.key)).toEqual([
                "breakfast",
                "snack1",
                "lunch",
                "snack2",
                "dinner",
            ]);
            expectWithinLimits(plan);
        }
    });

    it("rolls one meal again, leaving the rest untouched and within limits", () => {
        for (let seed = 1; seed <= 100; seed += 1) {
            const random = seeded(seed);
            const plan = generateWeek(diet, "2026-10-05", random);
            const rerolled = rerollMeal(diet, plan, 3, "dinner", random);
            rerolled.days.forEach((day, index) =>
                day.meals.forEach((meal, position) => {
                    if (index !== 3 || meal.key !== "dinner") {
                        expect(meal).toEqual(plan.days[index]?.meals[position]);
                    }
                }),
            );
            expectWithinLimits(rerolled);
        }
    });

    it("starts weeks on Monday", () => {
        expect(mondayOf("2026-10-05")).toBe("2026-10-05");
        expect(mondayOf("2026-10-10")).toBe("2026-10-05");
        expect(mondayOf("2026-10-11")).toBe("2026-10-05");
        expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    });

    it("adds up the shopping list per food and unit", () => {
        const plan: MealPlan = {
            days: [
                {
                    meals: [
                        {
                            key: "breakfast",
                            picks: [{ optionId: "porridge", slot: "Porridge" }],
                            variantId: "porridge",
                        },
                        {
                            key: "breakfast",
                            picks: [
                                { optionId: "latte", slot: "Bevanda" },
                                { optionId: "fette", slot: "Base" },
                            ],
                            variantId: "classica",
                        },
                        {
                            key: "dinner",
                            picks: [{ optionId: "cornetto", slot: "Cornetto" }],
                            variantId: "cena",
                        },
                    ],
                },
                ...Array.from({ length: 6 }, () => ({ meals: [] })),
            ],
            startDate: "2026-10-05",
        };
        expect(shoppingList(diet, plan)).toEqual([
            { amount: null, count: 1, food: "Cornetto", unit: null },
            { amount: 4, count: 1, food: "Fette biscottate", unit: "pcs" },
            { amount: 40, count: 1, food: "Fiocchi d'avena", unit: "g" },
            { amount: 400, count: 2, food: "Latte", unit: "ml" },
        ]);
    });
});

describe("diet schema", () => {
    const parse = (changes: Partial<Diet>) => dietSchema.safeParse({ ...diet, ...changes });

    it("rejects slots that point at unknown options and duplicate ids", () => {
        const [first, ...rest] = diet.meals;
        const dangling = {
            ...first,
            key: "breakfast" as const,
            variants: [{ id: "x", name: "X", slots: [{ name: "Y", optionIds: ["missing"] }] }],
        };
        expect(parse({ meals: [dangling, ...rest] }).success).toBe(false);
        expect(parse({ options: [...diet.options, ...diet.options.slice(0, 1)] }).success).toBe(
            false,
        );
        expect(parse({ meals: [...diet.meals, ...diet.meals.slice(0, 1)] }).success).toBe(false);
        expect(dietSchema.safeParse({ ...diet, extra: true }).success).toBe(false);
    });

    it("embeds the JSON Schema in the prompt", () => {
        const prompt = dietPrompt();
        expect(prompt).toContain('"optionIds"');
        expect(prompt).toContain('"maxPerWeek"');
        expect(prompt.endsWith("Diet plan:\n")).toBe(true);
    });
});
