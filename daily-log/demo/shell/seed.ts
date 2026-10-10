import {
    localDateInZone,
    localDateTimeToUtc,
    shiftDate,
    toStorageTimestamp,
} from "@/core/time/zoned-time";
import { generateWeek, mondayOf } from "@/features/meal-plan/meal-plan";
import { type Diet, dietSchema } from "@/features/meal-plan/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import { getDemoDatabase } from "@demo/shell/database";

const OWNER = 1;
const DAYS = 42;

/** A small seeded generator, so every visitor starts from the same story. */
function seeded(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

const meals = {
    Breakfast: [
        "Greek yogurt, oats, and blueberries",
        "Wholegrain toast with peanut butter, coffee",
        "Porridge with banana and cinnamon",
        "Scrambled eggs on rye, orange juice",
    ],
    "Snack 1": ["An apple", "A handful of almonds", "Rice cakes with hummus"],
    Lunch: [
        "Chicken salad with chickpeas and feta",
        "Pasta with tomato sauce and tuna",
        "Lentil soup and a slice of bread",
        "Rice bowl with salmon and edamame",
    ],
    "Snack 2": ["Pear and a few walnuts", "Yogurt with honey", "Carrot sticks and hummus"],
    Dinner: [
        "Grilled salmon, potatoes, and green beans",
        "Vegetable stir-fry with tofu and noodles",
        "Turkey burger with salad",
        "Minestrone and a cheese toastie",
        "Homemade pizza with friends",
    ],
} as const;

const notes = [
    "Slept well and had a lot of energy for the morning run.",
    "Busy day at work; skipped the afternoon snack.",
    "Tried a new lentil recipe, worth repeating.",
    "Felt a bit tired, went to bed early.",
    "Long walk by the river with a friend.",
];

const diet: Diet = dietSchema.parse({
    meals: [
        {
            key: "breakfast",
            variants: [
                {
                    id: "classic",
                    name: "Classic",
                    slots: [
                        { name: "Drink", optionIds: ["milk", "yogurt"] },
                        { name: "Base", optionIds: ["oats", "toast"] },
                    ],
                },
                {
                    id: "eggs",
                    maxPerWeek: 2,
                    name: "Eggs on toast",
                    slots: [{ name: "Eggs", optionIds: ["eggs"] }],
                },
            ],
        },
        ...(["snack1", "snack2"] as const).map((key) => ({
            key,
            variants: [
                {
                    id: `snack-${key}`,
                    name: "Snack",
                    slots: [{ name: "Snack", optionIds: ["apple", "pear", "almonds", "yogurt"] }],
                },
            ],
        })),
        {
            key: "lunch",
            variants: [
                {
                    id: "lunch",
                    name: "Lunch",
                    slots: [
                        { name: "Protein", optionIds: ["chicken", "fish", "lentils", "beef"] },
                        { name: "Carbs", optionIds: ["pasta", "rice", "bread"] },
                    ],
                },
            ],
        },
        {
            key: "dinner",
            variants: [
                {
                    id: "dinner",
                    name: "Dinner",
                    slots: [
                        { name: "Protein", optionIds: ["chicken", "fish", "lentils", "beef"] },
                        { name: "Fruit", optional: true, optionIds: ["apple", "pear"] },
                    ],
                },
                { id: "free-dinner", maxPerWeek: 1, name: "Free dinner", slots: [] },
            ],
        },
    ],
    name: "Sample balanced diet",
    notes: ["Vegetables as you like at lunch and dinner.", "One tablespoon of olive oil per meal."],
    options: [
        { id: "milk", items: [{ amount: 200, food: "Milk", unit: "ml" }], name: "Milk" },
        { id: "yogurt", items: [{ amount: 125, food: "Yogurt", unit: "g" }], name: "Yogurt" },
        { id: "oats", items: [{ amount: 40, food: "Oats", unit: "g" }], name: "Oats" },
        {
            id: "toast",
            items: [{ amount: 2, food: "Wholegrain toast", unit: "pcs" }],
            name: "Toast",
        },
        {
            id: "eggs",
            items: [
                { amount: 2, food: "Eggs", unit: "pcs" },
                { amount: 1, food: "Wholegrain toast", unit: "pcs" },
            ],
            name: "Eggs on toast",
        },
        {
            id: "apple",
            items: [{ amount: 1, food: "Apple", unit: "pcs" }],
            maxPerDay: 2,
            name: "Apple",
        },
        {
            id: "pear",
            items: [{ amount: 1, food: "Pear", unit: "pcs" }],
            maxPerDay: 2,
            name: "Pear",
        },
        {
            id: "almonds",
            items: [{ amount: 30, food: "Almonds", unit: "g" }],
            maxPerWeek: 3,
            name: "Almonds",
        },
        {
            id: "chicken",
            items: [{ amount: 150, food: "Chicken breast", unit: "g" }],
            name: "Chicken",
        },
        { id: "fish", items: [{ amount: 150, food: "White fish", unit: "g" }], name: "Fish" },
        { id: "lentils", items: [{ amount: 80, food: "Lentils", unit: "g" }], name: "Lentils" },
        {
            id: "beef",
            items: [{ amount: 120, food: "Lean beef", unit: "g" }],
            name: "Beef",
            weight: 0.3,
        },
        { id: "pasta", items: [{ amount: 80, food: "Pasta", unit: "g" }], name: "Pasta" },
        { id: "rice", items: [{ amount: 80, food: "Rice", unit: "g" }], name: "Rice" },
        { id: "bread", items: [{ amount: 60, food: "Bread", unit: "g" }], name: "Bread" },
    ],
    version: 1,
});

/** Six weeks of a fictional person's records, ending now in the visitor's time zone. */
export function seedDemo(timeZone: string): void {
    const random = seeded(20_261_010);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const logbook = new LogbookRepository();
    const now = Date.now();
    const today = localDateInZone(new Date(now), timeZone);
    const at = (day: string, time: string) => localDateTimeToUtc(day, time, timeZone);
    const past = (iso: string) => Date.parse(iso) <= now;

    logbook.updateProfile(OWNER, {
        birthDate: "1993-04-18",
        firstName: "Alex",
        goalDate: shiftDate(today, 90),
        heightCm: 176,
        lastName: "Sample",
    });

    let weightGrams = 79_400;
    for (let offset = DAYS; offset >= 0; offset -= 1) {
        const day = shiftDate(today, -offset);
        const mealTimes = [
            ["Breakfast", "07:45"],
            ["Snack 1", "10:30"],
            ["Lunch", "13:00"],
            ["Snack 2", "16:30"],
            ["Dinner", "20:00"],
        ] as const;
        for (const [label, time] of mealTimes) {
            if (label.startsWith("Snack") && random() < 0.3) continue;
            const startAt = at(day, time);
            if (past(startAt))
                logbook.createEntry(OWNER, {
                    kind: "meal",
                    label,
                    startAt,
                    text: pick(meals[label]),
                });
        }

        // Sleep from the night before, 6.5 to 8.5 hours.
        const bedtime = at(shiftDate(day, -1), pick(["22:45", "23:15", "23:40", "00:10"] as const));
        const sleepEnd = new Date(
            Date.parse(bedtime) + (6.5 + random() * 2) * 3_600_000,
        ).toISOString();
        if (past(sleepEnd)) {
            logbook.createEntry(OWNER, {
                endAt: sleepEnd,
                kind: "sleep",
                label: "Sleep",
                startAt: bedtime,
                text: "",
            });
        }

        if (random() < 0.55) {
            const [label, start, minutes] = pick([
                ["Run", "07:00", 35],
                ["Gym", "18:30", 60],
                ["Walk", "17:45", 45],
                ["Tennis", "19:00", 75],
            ] as const);
            const startAt = at(day, start);
            const endAt = new Date(Date.parse(startAt) + minutes * 60_000).toISOString();
            if (past(endAt))
                logbook.createEntry(OWNER, { endAt, kind: "training", label, startAt, text: "" });
        }

        if (offset % 2 === 0) {
            weightGrams += Math.round((-120 + (random() - 0.5) * 400) / 100) * 100;
            const recordedAt = at(day, "07:30");
            if (past(recordedAt)) logbook.createWeighIn(OWNER, weightGrams, recordedAt);
        }
        if (random() < 0.3) logbook.saveDayNote(OWNER, day, pick(notes));
    }

    // The goal was set four weeks ago, so the profile shows some progress.
    logbook.updateProfile(OWNER, { goalWeightGrams: 74_000 });
    getDemoDatabase()
        .prepare("UPDATE user_profiles SET goal_set_at = ? WHERE user_id = ?")
        .run(toStorageTimestamp(at(shiftDate(today, -28), "08:00")), OWNER);
    logbook.saveDiet(OWNER, diet);
    logbook.saveMealPlan(OWNER, generateWeek(diet, mondayOf(today), random));
}
