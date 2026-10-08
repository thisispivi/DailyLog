import { z } from "zod";

import { entryKinds, locales, themes, weightUnits } from "@/features/logbook/domain";

// Request schemas are strict: an unexpected key is a client bug or a probe, never
// something to silently drop.

const isoTimestamp = z.iso.datetime({ offset: true });

const endFollowsStart = (value: {
    endAt?: string | null | undefined;
    startAt?: string | undefined;
}) => !value.endAt || !value.startAt || Date.parse(value.endAt) > Date.parse(value.startAt);

const endAfterStartIssue = { message: "End time must follow start time.", path: ["endAt"] };

export const recordIdSchema = z.coerce.number().int().positive();

export const createEntrySchema = z
    .strictObject({
        endAt: isoTimestamp.nullable().optional(),
        kind: z.enum(entryKinds),
        label: z.string().trim().min(1).max(120),
        startAt: isoTimestamp,
        text: z.string().trim().max(2000).default(""),
    })
    .refine((value) => value.kind !== "meal" || !value.endAt, {
        message: "Meals cannot have an end time.",
        path: ["endAt"],
    })
    .refine(endFollowsStart, endAfterStartIssue);

export type NewEntry = z.infer<typeof createEntrySchema>;

export const updateEntrySchema = z
    .strictObject({
        endAt: isoTimestamp.nullable(),
        kind: z.enum(entryKinds),
        label: z.string().trim().min(1).max(120),
        startAt: isoTimestamp,
        text: z.string().trim().max(2000),
    })
    .partial()
    .refine(endFollowsStart, endAfterStartIssue);

export type EntryChanges = z.infer<typeof updateEntrySchema>;

export const finishActivitySchema = z.strictObject({ endAt: isoTimestamp });

export const dayDeletionSchema = z.strictObject({ date: z.iso.date() });

export const entryFiltersSchema = z.strictObject({
    from: z.iso.date().optional(),
    kind: z.enum(entryKinds).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    query: z.string().trim().max(120).optional(),
    to: z.iso.date().optional(),
});

// 1 to 1000 in either unit keeps the stored grams inside the database CHECK range.
const weightValue = z.number().min(1).max(1000);

export const createWeighInSchema = z.strictObject({
    recordedAt: isoTimestamp,
    unit: z.enum(weightUnits),
    weight: weightValue,
});

export const updateWeighInSchema = createWeighInSchema
    .partial()
    .refine((value) => value.weight === undefined || value.unit !== undefined, {
        message: "Unit is required when updating weight.",
        path: ["unit"],
    });

export const updateSettingsSchema = z
    .strictObject({
        exportLocale: z.enum(locales),
        locale: z.enum(locales),
        theme: z.enum(themes),
        weightUnit: z.enum(weightUnits),
    })
    .partial()
    .refine((value) => Object.keys(value).length > 0, "At least one setting is required.");

export type SettingsChanges = z.infer<typeof updateSettingsSchema>;

export const restoreSchema = z.strictObject({
    recordId: z.number().int().positive(),
    recordType: z.enum(["entry", "weighIn"]),
});

export const exportQuerySchema = z.strictObject({
    all: z.enum(["true", "false"]).default("false"),
    format: z.enum(["xlsx", "pdf"]),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
});
