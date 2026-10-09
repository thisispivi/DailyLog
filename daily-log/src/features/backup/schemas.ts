import { z } from "zod";

import {
    DAY_NOTE_MAX_LENGTH,
    entryKinds,
    locales,
    themes,
    weightUnits,
} from "@/features/logbook/domain";
import { HEIGHT_RANGE_CM } from "@/features/profile/schemas";

/** Bump when the file shape changes in a way older imports cannot read. */
export const BACKUP_VERSION = 1;

const isoTimestamp = z.iso.datetime({ offset: true });

const backupEntry = z
    .strictObject({
        endAt: isoTimestamp.nullable(),
        kind: z.enum(entryKinds),
        label: z.string().trim().min(1).max(120),
        startAt: isoTimestamp,
        text: z.string().trim().max(2000),
    })
    .refine((entry) => entry.kind !== "meal" || !entry.endAt, "Meals cannot have an end time.")
    .refine(
        (entry) => !entry.endAt || Date.parse(entry.endAt) > Date.parse(entry.startAt),
        "End time must follow start time.",
    );

/** A whole-account export. Ids and audit timestamps are left out; import creates new ones. */
export const backupSchema = z.strictObject({
    app: z.literal("DailyLog"),
    entries: z.array(backupEntry).max(200_000),
    exportedAt: isoTimestamp,
    notes: z
        .array(
            z.strictObject({
                day: z.iso.date(),
                text: z.string().min(1).max(DAY_NOTE_MAX_LENGTH),
            }),
        )
        .max(50_000),
    profile: z.strictObject({
        birthDate: z.iso.date().nullable(),
        firstName: z.string().trim().max(60),
        heightCm: z.number().int().min(HEIGHT_RANGE_CM.min).max(HEIGHT_RANGE_CM.max).nullable(),
        lastName: z.string().trim().max(60),
    }),
    settings: z.strictObject({
        exportLocale: z.enum(locales),
        locale: z.enum(locales),
        theme: z.enum(themes),
        weightUnit: z.enum(weightUnits),
    }),
    version: z.literal(BACKUP_VERSION),
    weighIns: z
        .array(
            z.strictObject({
                recordedAt: isoTimestamp,
                weightGrams: z.number().int().min(1).max(1_000_000),
            }),
        )
        .max(100_000),
});

export type Backup = z.infer<typeof backupSchema>;

/** How many records an import added; duplicates of existing records are skipped. */
export type ImportResult = Readonly<{ entries: number; notes: number; weighIns: number }>;
