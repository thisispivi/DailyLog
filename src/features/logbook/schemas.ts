import { z } from "zod";

import { entryKinds } from "@/features/logbook/domain";

const isoTimestamp = z.iso.datetime({ offset: true });

const entryInputSchema = z.object({
    endAt: isoTimestamp.nullable().optional(),
    kind: z.enum(entryKinds),
    label: z.string().trim().min(1).max(120),
    startAt: isoTimestamp,
    text: z.string().trim().max(2000).default(""),
});

export const createEntrySchema = entryInputSchema.superRefine((value, context) => {
    if (value.kind === "meal" && value.endAt) {
        context.addIssue({
            code: "custom",
            path: ["endAt"],
            message: "Meals cannot have an end time.",
        });
    }
    if (value.endAt && Date.parse(value.endAt) <= Date.parse(value.startAt)) {
        context.addIssue({
            code: "custom",
            path: ["endAt"],
            message: "End time must follow start time.",
        });
    }
});

export const updateEntrySchema = entryInputSchema.partial().superRefine((value, context) => {
    if (value.endAt && value.startAt && Date.parse(value.endAt) <= Date.parse(value.startAt)) {
        context.addIssue({
            code: "custom",
            path: ["endAt"],
            message: "End time must follow start time.",
        });
    }
});

export const createWeighInSchema = z.object({
    recordedAt: isoTimestamp,
    weight: z.number().positive().max(1000),
    unit: z.enum(["kg", "lb"]),
});

export const updateWeighInSchema = createWeighInSchema
    .partial()
    .refine((value) => value.weight === undefined || value.unit !== undefined, {
        path: ["unit"],
        message: "Unit is required when updating weight.",
    });

export const updateSettingsSchema = z
    .object({
        exportLocale: z.enum(["en", "it"]),
        locale: z.enum(["en", "it"]),
        theme: z.enum(["light", "dark", "system"]),
        weightUnit: z.enum(["kg", "lb"]),
    })
    .partial()
    .refine((value) => Object.keys(value).length > 0, "At least one setting is required.");

export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export function weightToGrams(weight: number, unit: "kg" | "lb"): number {
    const kilograms = unit === "kg" ? weight : weight * 0.45359237;
    const grams = Math.round(kilograms * 1000);
    if (grams <= 0 || grams > 1_000_000) throw new Error("Weight is outside the supported range.");
    return grams;
}
