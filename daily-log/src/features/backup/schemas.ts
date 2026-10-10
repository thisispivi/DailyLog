import { z } from "zod";

import { DAY_NOTE_MAX_LENGTH, timeFormats } from "@/features/logbook/domain";
import { createEntrySchema, isoTimestamp, settingsSchema } from "@/features/logbook/schemas";
import { goalDateSchema, goalWeightGramsSchema, profileSchema } from "@/features/profile/schemas";

/** Bump when the file shape changes in a way older imports cannot read. */
export const BACKUP_VERSION = 1;

/**
 * A whole-account export. Ids and audit timestamps are left out; import creates new ones.
 * Records reuse the request schemas, so a backup can never hold what the API would reject.
 */
export const backupSchema = z.strictObject({
    app: z.literal("DailyLog"),
    entries: z.array(createEntrySchema).max(200_000),
    exportedAt: isoTimestamp,
    notes: z
        .array(
            z.strictObject({
                day: z.iso.date(),
                text: z.string().min(1).max(DAY_NOTE_MAX_LENGTH),
            }),
        )
        .max(50_000),
    // Backups made before weight goals existed have no goal fields.
    profile: profileSchema.extend({
        goalDate: goalDateSchema.default(null),
        goalWeightGrams: goalWeightGramsSchema.default(null),
    }),
    // Backups made before the time format existed have no timeFormat.
    settings: settingsSchema.extend({ timeFormat: z.enum(timeFormats).default("24h") }),
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
