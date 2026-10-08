import {
    entryDurationMs,
    type Entry,
    type EntryKind,
    type WeighIn,
} from "@/features/logbook/domain";

export type DashboardSummary = Readonly<{
    count: number;
    sleepHours: number;
    trainingMinutes: number;
    weight: WeighIn | null;
}>;

/** Totals for one day. `weighIns` is newest first, so the first one is the current weight. */
export function summarizeDay(
    entries: readonly Entry[],
    weighIns: readonly WeighIn[],
): DashboardSummary {
    const totalMs = (kind: EntryKind) =>
        entries
            .filter((entry) => entry.kind === kind)
            .reduce((sum, entry) => sum + entryDurationMs(entry), 0);
    return {
        count: entries.length + weighIns.length,
        sleepHours: Math.round(totalMs("sleep") / 360_000) / 10,
        trainingMinutes: Math.round(totalMs("training") / 60_000),
        weight: weighIns[0] ?? null,
    };
}
