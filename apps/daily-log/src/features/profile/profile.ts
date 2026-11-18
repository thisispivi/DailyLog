import type { WeighIn } from "@/features/logbook/domain";

/** Personal details shown on the profile page and at the top of exports. */
export type UserProfile = Readonly<{
    birthDate: string | null;
    /** Optional day (`YYYY-MM-DD`) by which to reach the goal weight. */
    goalDate: string | null;
    goalWeightGrams: number | null;
    firstName: string;
    heightCm: number | null;
    lastName: string;
}>;

export const EMPTY_PROFILE: UserProfile = {
    birthDate: null,
    firstName: "",
    goalDate: null,
    goalWeightGrams: null,
    heightCm: null,
    lastName: "",
};

export const bmiCategories = ["underweight", "healthy", "overweight", "obese"] as const;
export type BmiCategory = (typeof bmiCategories)[number];

/** Whole years between a birth date and a calendar day, both `YYYY-MM-DD`. */
export function ageOn(birthDate: string, day: string): number {
    const years = Number(day.slice(0, 4)) - Number(birthDate.slice(0, 4));
    // Comparing "MM-DD" strings tells whether this year's birthday has come yet.
    return day.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

/** Body mass index (kg/m²), rounded to one decimal. */
export function bodyMassIndex(weightGrams: number, heightCm: number): number {
    const meters = heightCm / 100;
    return Math.round((weightGrams / 1000 / (meters * meters)) * 10) / 10;
}

/** The WHO adult categories. */
export function bmiCategory(bmi: number): BmiCategory {
    if (bmi < 18.5) return "underweight";
    if (bmi < 25) return "healthy";
    if (bmi < 30) return "overweight";
    return "obese";
}

export function fullName(profile: UserProfile): string {
    return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
}

const WEEK_MS = 7 * 86_400_000;
/** Pace comes from the last four weeks of weigh-ins, so old trends don't linger. */
const PACE_WINDOW_MS = 4 * WEEK_MS;

export type WeightGoal = Readonly<{
    date: string | null;
    /** When the goal weight was last set; the start weight is read from then. */
    setAt: string | null;
    weightGrams: number;
}>;

export type WeightGoalProgress = Readonly<{
    changeGrams: number;
    currentGrams: number;
    /** When the goal is reached at the recent pace, or null if that pace never gets there. */
    estimatedAt: number | null;
    /** Weekly change needed to reach the goal by its date, or null without a future date. */
    neededWeeklyGrams: number | null;
    /** Share of the way from the start weight to the goal, 0 to 1. */
    progress: number;
    reached: boolean;
    remainingGrams: number;
    startGrams: number;
    targetGrams: number;
    /** Least-squares trend of recent weigh-ins, or null with less than a week of them. */
    weeklyPaceGrams: number | null;
}>;

/** Progress towards a goal weight; `weighIns` are oldest first. */
export function weightGoalProgress(
    weighIns: readonly WeighIn[],
    goal: WeightGoal,
    now: number,
): WeightGoalProgress | null {
    const current = weighIns.at(-1);
    if (!current) return null;
    const setAt = goal.setAt ? Date.parse(goal.setAt) : -Infinity;
    const start =
        weighIns.findLast((weighIn) => Date.parse(weighIn.recordedAt) <= setAt) ??
        weighIns.find((weighIn) => Date.parse(weighIn.recordedAt) > setAt) ??
        current;
    const startGrams = start.weightGrams;
    const currentGrams = current.weightGrams;
    const targetGrams = goal.weightGrams;
    const total = targetGrams - startGrams;
    const remainingGrams = targetGrams - currentGrams;
    const reached = total <= 0 ? currentGrams <= targetGrams : currentGrams >= targetGrams;
    const progress =
        total === 0
            ? Number(reached)
            : Math.min(1, Math.max(0, (currentGrams - startGrams) / total));

    const currentAt = Date.parse(current.recordedAt);
    const weeklyPaceGrams = weeklyTrend(
        weighIns.filter((weighIn) => Date.parse(weighIn.recordedAt) >= currentAt - PACE_WINDOW_MS),
    );
    const towardsGoal =
        weeklyPaceGrams !== null && Math.sign(weeklyPaceGrams) === Math.sign(remainingGrams);
    const weeksLeft = goal.date ? (Date.parse(goal.date) - now) / WEEK_MS : 0;

    return {
        changeGrams: currentGrams - startGrams,
        currentGrams,
        estimatedAt:
            !reached && towardsGoal
                ? Math.round(currentAt + (remainingGrams / weeklyPaceGrams) * WEEK_MS)
                : null,
        neededWeeklyGrams: !reached && weeksLeft > 0 ? remainingGrams / weeksLeft : null,
        progress,
        reached,
        remainingGrams,
        startGrams,
        targetGrams,
        weeklyPaceGrams,
    };
}

/** Grams per week from a least-squares line, or null if the points span under a week. */
function weeklyTrend(weighIns: readonly WeighIn[]): number | null {
    const points = weighIns.map((weighIn) => ({
        x: Date.parse(weighIn.recordedAt),
        y: weighIn.weightGrams,
    }));
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last || last.x - first.x < WEEK_MS) return null;
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    let covariance = 0;
    let variance = 0;
    for (const point of points) {
        covariance += (point.x - meanX) * (point.y - meanY);
        variance += (point.x - meanX) ** 2;
    }
    return (covariance / variance) * WEEK_MS;
}
