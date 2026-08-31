import type { Entry, WeighIn } from "@/features/logbook/domain";

export type DashboardSummary = Readonly<{
    count: number;
    sleepHours: number;
    trainingMinutes: number;
    weight: WeighIn | null;
}>;

export function summarizeDay(
    entries: readonly Entry[],
    weighIns: readonly WeighIn[],
): DashboardSummary {
    const duration = (entry: Entry) =>
        entry.endAt ? Math.max(0, Date.parse(entry.endAt) - Date.parse(entry.startAt)) : 0;
    const trainingMinutes = Math.round(
        entries
            .filter((entry) => entry.kind === "training")
            .reduce((sum, entry) => sum + duration(entry), 0) / 60_000,
    );
    const sleepHours =
        Math.round(
            (entries
                .filter((entry) => entry.kind === "sleep")
                .reduce((sum, entry) => sum + duration(entry), 0) /
                3_600_000) *
                10,
        ) / 10;
    return {
        count: entries.length + weighIns.length,
        sleepHours,
        trainingMinutes,
        weight: weighIns[0] ?? null,
    };
}
