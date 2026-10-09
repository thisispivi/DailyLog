import { shiftDate } from "@/core/time/zoned-time";

/** A calendar month as YYYY-MM. */
export const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function shiftMonth(month: string, delta: number): string {
    const [year = 0, monthIndex = 1] = month.split("-").map(Number);
    const value = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
    return value.toISOString().slice(0, 7);
}

/**
 * Every date shown in a Monday-first month grid: whole weeks, starting on the
 * Monday on or before the 1st and ending on the Sunday on or after the last day.
 */
export function monthGrid(month: string): string[] {
    const first = `${month}-01`;
    const last = shiftDate(`${shiftMonth(month, 1)}-01`, -1);
    const weekday = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const start = shiftDate(first, -weekday(first));
    const end = shiftDate(last, 6 - weekday(last));
    const dates: string[] = [];
    for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date);
    return dates;
}
