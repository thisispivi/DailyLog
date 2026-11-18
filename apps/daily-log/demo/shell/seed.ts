import {
    localDateInZone,
    localDateTimeToUtc,
    shiftDate,
    toStorageTimestamp,
} from "@/core/time/zoned-time";
import type { Locale } from "@/features/logbook/domain";
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

// Every sample text has an English and an Italian version. The seed writes the
// English one and localizeDemo swaps them when the visitor changes language.
const translations: Array<readonly [en: string, it: string]> = [];
function bilingual(en: string, it: string): string {
    if (en !== it) translations.push([en, it]);
    return en;
}

const meals = {
    Breakfast: [
        bilingual("Greek yogurt, oats, and blueberries", "Yogurt greco, avena e mirtilli"),
        bilingual(
            "Wholegrain toast with peanut butter, coffee",
            "Pane integrale tostato con burro di arachidi, caffè",
        ),
        bilingual("Porridge with banana and cinnamon", "Porridge con banana e cannella"),
        bilingual(
            "Scrambled eggs on rye, orange juice",
            "Uova strapazzate su pane di segale, spremuta d'arancia",
        ),
    ],
    "Snack 1": [
        bilingual("An apple", "Una mela"),
        bilingual("A handful of almonds", "Una manciata di mandorle"),
        bilingual("Rice cakes with hummus", "Gallette di riso con hummus"),
    ],
    Lunch: [
        bilingual("Chicken salad with chickpeas and feta", "Insalata di pollo con ceci e feta"),
        bilingual("Pasta with tomato sauce and tuna", "Pasta al pomodoro e tonno"),
        bilingual("Lentil soup and a slice of bread", "Zuppa di lenticchie e una fetta di pane"),
        bilingual("Rice bowl with salmon and edamame", "Bowl di riso con salmone ed edamame"),
    ],
    "Snack 2": [
        bilingual("Pear and a few walnuts", "Pera e qualche noce"),
        bilingual("Yogurt with honey", "Yogurt con miele"),
        bilingual("Carrot sticks and hummus", "Bastoncini di carota e hummus"),
    ],
    Dinner: [
        bilingual(
            "Grilled salmon, potatoes, and green beans",
            "Salmone alla griglia, patate e fagiolini",
        ),
        bilingual("Vegetable stir-fry with tofu and noodles", "Verdure saltate con tofu e noodles"),
        bilingual("Turkey burger with salad", "Burger di tacchino con insalata"),
        bilingual("Minestrone and a cheese toastie", "Minestrone e un toast al formaggio"),
        bilingual("Homemade pizza with friends", "Pizza fatta in casa con gli amici"),
    ],
} as const;

const notes = [
    bilingual(
        "Slept well and had a lot of energy for the evening run.",
        "Dormito bene e tanta energia per la corsa della sera.",
    ),
    bilingual(
        "Busy day at work; skipped the afternoon snack.",
        "Giornata piena al lavoro; saltato lo spuntino del pomeriggio.",
    ),
    bilingual(
        "Tried a new lentil recipe, worth repeating.",
        "Provata una nuova ricetta con le lenticchie, da rifare.",
    ),
    bilingual("Felt a bit tired, went to bed early.", "Un po' di stanchezza, a letto presto."),
    bilingual(
        "Long walk by the river with a friend.",
        "Lunga passeggiata lungo il fiume con un amico.",
    ),
];

// Activities fit between the afternoon snack and dinner, never overlapping sleep.
const trainings = [
    [bilingual("Run", "Corsa"), "18:00", 35],
    [bilingual("Gym", "Palestra"), "18:30", 60],
    [bilingual("Walk", "Camminata"), "17:15", 45],
    ["Tennis", "18:15", 75],
] as const;

/**
 * Rewrites the sample texts in the visitor's language. Only texts that still
 * read as seeded change, so the visitor's own records are left alone.
 */
export function localizeDemo(from: Locale, to: Locale): void {
    if (from === to) return;
    const database = getDemoDatabase();
    const exact = [
        "UPDATE entries SET text = ? WHERE user_id = ? AND text = ?",
        "UPDATE entries SET label = ? WHERE user_id = ? AND kind = 'training' AND label = ?",
        "UPDATE day_notes SET text = ? WHERE user_id = ? AND text = ?",
    ].map((sql) => database.prepare(sql));
    database.transaction(() => {
        for (const [en, it] of translations) {
            const [source, target] = from === "en" ? [en, it] : [it, en];
            for (const statement of exact) statement.run(target, OWNER, source);
        }
    })();
}

/** Six weeks of a fictional person's records, ending now in the visitor's time zone. */
export function seedDemo(timeZone: string, locale: Locale): void {
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

        // Sleep from the night before, 6.5 to 7.5 hours, so it ends before the weigh-in.
        const bedtime = new Date(
            Date.parse(at(day, "00:00")) + pick([-75, -45, -20, 10]) * 60_000,
        ).toISOString();
        const sleepEnd = new Date(Date.parse(bedtime) + (6.5 + random()) * 3_600_000).toISOString();
        if (past(sleepEnd)) {
            logbook.createEntry(OWNER, {
                endAt: sleepEnd,
                kind: "sleep",
                label: "Sleep",
                startAt: bedtime,
                text: "",
            });
        }

        if (offset % 2 === 0) {
            weightGrams += Math.round((-120 + (random() - 0.5) * 400) / 100) * 100;
            const recordedAt = at(day, "07:45");
            if (past(recordedAt)) logbook.createWeighIn(OWNER, weightGrams, recordedAt);
        }

        const mealTimes = [
            ["Breakfast", "08:00"],
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

        if (random() < 0.55) {
            const [label, start, minutes] = pick(trainings);
            const startAt = at(day, start);
            const endAt = new Date(Date.parse(startAt) + minutes * 60_000).toISOString();
            if (past(endAt))
                logbook.createEntry(OWNER, { endAt, kind: "training", label, startAt, text: "" });
        }

        if (random() < 0.3) logbook.saveDayNote(OWNER, day, pick(notes));
        if (past(at(day, "22:00")) && random() < 0.6) {
            logbook.saveDayLog(OWNER, day, {
                steps: Math.round(4_000 + random() * 9_000),
                travel: random() < 0.08,
            });
        }
    }

    // The goal was set four weeks ago, so the profile shows some progress.
    logbook.updateProfile(OWNER, { goalWeightGrams: 74_000 });
    getDemoDatabase()
        .prepare("UPDATE user_profiles SET goal_set_at = ? WHERE user_id = ?")
        .run(toStorageTimestamp(at(shiftDate(today, -28), "08:00")), OWNER);
    logbook.updateSettings(OWNER, { exportLocale: locale, locale });
    localizeDemo("en", locale);
}
