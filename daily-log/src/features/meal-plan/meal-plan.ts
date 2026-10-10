import { shiftDate } from "@/core/time/zoned-time";
import {
    type Diet,
    type DietOption,
    type FoodUnit,
    type MealKey,
    mealKeys,
    type MealPlan,
    type PlannedMeal,
} from "@/features/meal-plan/schemas";

type Random = () => number;

/** The Monday on or before a calendar day (`YYYY-MM-DD`). */
export function mondayOf(day: string): string {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    return shiftDate(day, -((weekday + 6) % 7));
}

/** How often each option and variant is already used, in the week and on each day. */
type Usage = { days: Array<Map<string, number>>; week: Map<string, number> };

const MAX_ATTEMPTS = 50;
const variantKey = (id: string) => `variant:${id}`;

function emptyUsage(): Usage {
    return { days: Array.from({ length: 7 }, () => new Map()), week: new Map() };
}

function count(map: Map<string, number>, key: string): number {
    return map.get(key) ?? 0;
}

function record(usage: Usage, day: number, meal: PlannedMeal): void {
    if (meal.variantId) {
        const key = variantKey(meal.variantId);
        usage.week.set(key, count(usage.week, key) + 1);
    }
    for (const { optionId } of meal.picks) {
        if (!optionId) continue;
        usage.week.set(optionId, count(usage.week, optionId) + 1);
        const daily = usage.days[day];
        daily?.set(optionId, count(daily, optionId) + 1);
    }
}

function pickWeighted<T extends { weight?: number | undefined }>(
    items: readonly T[],
    random: Random,
): T | undefined {
    const total = items.reduce((sum, item) => sum + (item.weight ?? 1), 0);
    let target = random() * total;
    for (const item of items) {
        target -= item.weight ?? 1;
        if (target < 0) return item;
    }
    return items.at(-1);
}

const missingPicks = (meal: PlannedMeal) =>
    (meal.variantId ? 0 : 1) + meal.picks.filter((pick) => !pick.optionId).length;

/** Picks one meal that keeps every weekly and daily limit, given what is already used. */
function planMeal(
    diet: Diet,
    key: MealKey,
    day: number,
    usage: Usage,
    random: Random,
): PlannedMeal {
    const meal = diet.meals.find((candidate) => candidate.key === key);
    const variant = pickWeighted(
        (meal?.variants ?? []).filter(
            (candidate) =>
                candidate.maxPerWeek === undefined ||
                count(usage.week, variantKey(candidate.id)) < candidate.maxPerWeek,
        ),
        random,
    );
    if (!variant) return { key, picks: [], variantId: null };

    // Track this meal's own picks too, so two slots cannot exceed a limit together.
    const local: Usage = {
        days: usage.days.map((daily) => new Map(daily)),
        week: new Map(usage.week),
    };
    const options = new Map(diet.options.map((option) => [option.id, option]));
    const fits = (option: DietOption) =>
        (option.maxPerWeek === undefined || count(local.week, option.id) < option.maxPerWeek) &&
        count(local.days[day] ?? new Map(), option.id) < (option.maxPerDay ?? 1);

    const picks: PlannedMeal["picks"] = [];
    for (const slot of variant.slots) {
        if (slot.optional && random() < 0.5) continue;
        const candidates = slot.optionIds
            .map((optionId) => options.get(optionId))
            .filter((option): option is DietOption => option !== undefined && fits(option));
        const option = pickWeighted(candidates, random);
        picks.push({ optionId: option?.id ?? null, slot: slot.name });
        if (option)
            record(local, day, {
                key,
                picks: [{ optionId: option.id, slot: slot.name }],
                variantId: null,
            });
    }
    return { key, picks, variantId: variant.id };
}

function orderedMealKeys(diet: Diet): MealKey[] {
    return mealKeys.filter((key) => diet.meals.some((meal) => meal.key === key));
}

/**
 * A random week that respects every limit in the diet. Picks greedily day by
 * day and starts over on a dead end; after the last attempt it returns the
 * plan with the fewest gaps, gaps marked with a null option.
 * ponytail: greedy + restart; backtracking if real diets dead-end.
 */
export function generateWeek(diet: Diet, startDate: string, random: Random): MealPlan {
    let best: { missing: number; plan: MealPlan } | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const usage = emptyUsage();
        const days = Array.from({ length: 7 }, (_, day) => ({
            meals: orderedMealKeys(diet).map((key) => {
                const meal = planMeal(diet, key, day, usage, random);
                record(usage, day, meal);
                return meal;
            }),
        }));
        const missing = days
            .flatMap((day) => day.meals)
            .reduce((sum, meal) => sum + missingPicks(meal), 0);
        if (!best || missing < best.missing) best = { missing, plan: { days, startDate } };
        if (missing === 0) break;
    }
    // MAX_ATTEMPTS is positive, so the loop ran at least once.
    return best?.plan ?? { days: [], startDate };
}

/** Rolls one meal again; the rest of the plan stays as it was and still counts towards the limits. */
export function rerollMeal(
    diet: Diet,
    plan: MealPlan,
    dayIndex: number,
    key: MealKey,
    random: Random,
): MealPlan {
    const usage = emptyUsage();
    plan.days.forEach((day, index) => {
        for (const meal of day.meals) {
            if (index !== dayIndex || meal.key !== key) record(usage, index, meal);
        }
    });
    let best: PlannedMeal | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const meal = planMeal(diet, key, dayIndex, usage, random);
        if (!best || missingPicks(meal) < missingPicks(best)) best = meal;
        if (missingPicks(meal) === 0) break;
    }
    return {
        ...plan,
        days: plan.days.map((day, index) =>
            index === dayIndex
                ? { meals: day.meals.map((meal) => (meal.key === key && best ? best : meal)) }
                : day,
        ),
    };
}

/** An amount with its unit, e.g. "200 ml"; pieces use the translated short word. */
export function formatAmount(
    amount: number,
    unit: FoodUnit | null,
    locale: string,
    piecesLabel: string,
): string {
    const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(amount);
    return unit ? `${value} ${unit === "pcs" ? piecesLabel : unit}` : value;
}

export type ShoppingItem = Readonly<{
    /** Total across the week, or null when the diet gives no amount. */
    amount: number | null;
    /** How many planned meals use this food. */
    count: number;
    food: string;
    unit: FoodUnit | null;
}>;

/** Every food the week needs, with amounts added up per food and unit. */
export function shoppingList(diet: Diet, plan: MealPlan): ShoppingItem[] {
    const options = new Map(diet.options.map((option) => [option.id, option]));
    const totals = new Map<string, ShoppingItem>();
    for (const meal of plan.days.flatMap((day) => day.meals)) {
        for (const { optionId } of meal.picks) {
            for (const item of (optionId && options.get(optionId)?.items) || []) {
                const key = `${item.food.toLowerCase()}|${item.unit ?? ""}`;
                const previous = totals.get(key);
                totals.set(key, {
                    amount:
                        item.amount === undefined
                            ? (previous?.amount ?? null)
                            : (previous?.amount ?? 0) + item.amount,
                    count: (previous?.count ?? 0) + 1,
                    food: previous?.food ?? item.food,
                    unit: item.unit ?? null,
                });
            }
        }
    }
    return [...totals.values()].sort((a, b) => a.food.localeCompare(b.food));
}
