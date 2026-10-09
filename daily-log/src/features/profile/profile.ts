/** Personal details shown on the profile page and at the top of exports. */
export type UserProfile = Readonly<{
    birthDate: string | null;
    firstName: string;
    heightCm: number | null;
    lastName: string;
}>;

export const EMPTY_PROFILE: UserProfile = {
    birthDate: null,
    firstName: "",
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
