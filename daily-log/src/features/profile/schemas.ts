import { z } from "zod";

// Adult heights only; the bounds also match the database CHECK.
export const HEIGHT_RANGE_CM = { max: 250, min: 100 } as const;

const name = z.string().trim().max(60);

export const profileSchema = z.strictObject({
    birthDate: z.iso
        .date()
        .refine(
            (date) => date >= "1900-01-01" && Date.parse(date) <= Date.now(),
            "Birth date must be in the past.",
        )
        .nullable(),
    firstName: name,
    heightCm: z.number().int().min(HEIGHT_RANGE_CM.min).max(HEIGHT_RANGE_CM.max).nullable(),
    lastName: name,
});

export const updateProfileSchema = profileSchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export type ProfileChanges = z.infer<typeof updateProfileSchema>;
