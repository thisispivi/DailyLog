import { z } from "zod";

/** The same meals, in the same order, as the diary's meal labels. */
export const mealKeys = ["breakfast", "snack1", "lunch", "snack2", "dinner"] as const;
export type MealKey = (typeof mealKeys)[number];

export const foodUnits = ["g", "ml", "pcs"] as const;
export type FoodUnit = (typeof foodUnits)[number];

const id = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits, and hyphens.")
    .max(60)
    .describe("A short lowercase slug, unique within the diet, e.g. `greek-yogurt`.");
const name = z.string().trim().min(1).max(120);
const weight = z
    .number()
    .positive()
    .max(100)
    .optional()
    .describe(
        "Relative likelihood; 1 when left out. Use 0.3 for “less often”, 2 for “preferably”.",
    );
const maxPerWeek = z
    .number()
    .int()
    .min(1)
    .max(21)
    .optional()
    .describe("Hard limit on how many times a week this can be picked.");

const itemSchema = z.strictObject({
    amount: z.number().positive().max(100_000).optional(),
    food: name.describe("The food, in the diet's own language."),
    unit: z.enum(foodUnits).optional(),
});

const optionSchema = z.strictObject({
    id,
    items: z.array(itemSchema).min(1).max(20),
    maxPerDay: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Hard limit per day across all meals; 1 when left out."),
    maxPerWeek,
    name,
    weight,
});

const slotSchema = z.strictObject({
    name: name.describe("What this part of the meal is, e.g. `Protein` or `Fruit`."),
    optional: z.boolean().optional().describe("True when the diet says the part may be skipped."),
    optionIds: z.array(id).min(1).max(100).describe("Pick exactly one of these options."),
});

const variantSchema = z.strictObject({
    id,
    maxPerWeek,
    name,
    slots: z.array(slotSchema).max(10).describe("Empty for a free meal."),
    weight,
});

const mealSchema = z.strictObject({
    key: z.enum(mealKeys),
    variants: z.array(variantSchema).min(1).max(20),
});

/** A diet as an LLM writes it from the dietitian's plan; see `dietPrompt`. */
export const dietSchema = z
    .strictObject({
        meals: z.array(mealSchema).min(1).max(mealKeys.length),
        name,
        notes: z
            .array(z.string().trim().min(1).max(500))
            .max(30)
            .describe("Rules that apply to every meal, such as water, vegetables, or oil."),
        options: z.array(optionSchema).min(1).max(500),
        version: z.literal(1),
    })
    .superRefine((diet, context) => {
        const duplicate = (values: readonly string[]) =>
            values.find((value, index) => values.indexOf(value) !== index);
        const optionIds = diet.options.map((option) => option.id);
        const variantIds = diet.meals.flatMap((meal) => meal.variants.map((variant) => variant.id));
        const problems = [
            duplicate(optionIds) && `Option id "${duplicate(optionIds)}" is used twice.`,
            duplicate(variantIds) && `Variant id "${duplicate(variantIds)}" is used twice.`,
            duplicate(diet.meals.map((meal) => meal.key)) && "Each meal may appear only once.",
            ...diet.meals.flatMap((meal) =>
                meal.variants.flatMap((variant) =>
                    variant.slots.flatMap((slot) =>
                        slot.optionIds
                            .filter((optionId) => !optionIds.includes(optionId))
                            .map(
                                (optionId) =>
                                    `Slot "${slot.name}" uses unknown option "${optionId}".`,
                            ),
                    ),
                ),
            ),
        ];
        for (const message of problems) if (message) context.addIssue({ code: "custom", message });
    });

export type Diet = z.infer<typeof dietSchema>;
export type DietOption = Diet["options"][number];
export type DietVariant = Diet["meals"][number]["variants"][number];

const plannedMealSchema = z.strictObject({
    key: z.enum(mealKeys),
    /** One per slot that was filled; a null option means no option fitted the limits. */
    picks: z.array(z.strictObject({ optionId: id.nullable(), slot: name })),
    /** Null when every variant had reached its weekly limit. */
    variantId: id.nullable(),
});

export const mealPlanSchema = z.strictObject({
    days: z.array(z.strictObject({ meals: z.array(plannedMealSchema) })).length(7),
    startDate: z.iso.date(),
});

export type MealPlan = z.infer<typeof mealPlanSchema>;
export type PlannedMeal = MealPlan["days"][number]["meals"][number];

export const rerollSchema = z.strictObject({
    day: z.number().int().min(0).max(6),
    meal: z.enum(mealKeys),
});
