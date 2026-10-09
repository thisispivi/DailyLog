import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import Link from "next/link";

import { formatMinutes, translate } from "@/core/i18n/translate";
import { shiftMonth } from "@/features/calendar/month";
import type { DayTotals } from "@/features/insights/insights";
import { gramsToUnit, type Locale, type WeightUnit } from "@/features/logbook/domain";

import "./calendar-month.css";

const MONDAY = "2026-01-05";

// Calendar keys are plain dates, so they are formatted in UTC to avoid shifting.
const asDate = (date: string) => new Date(`${date}T12:00:00Z`);

function calendarHref(month: string, day?: string): string {
    return `/calendar?month=${month}${day ? `&day=${day}` : ""}`;
}

/** A month of day cells, each a link that selects the day below the grid. */
export function CalendarMonth({
    days,
    locale,
    month,
    noteDays,
    selected,
    today,
    weightUnit,
}: Readonly<{
    days: readonly DayTotals[];
    locale: Locale;
    month: string;
    noteDays: readonly string[];
    selected: string;
    today: string;
    weightUnit: WeightUnit;
}>) {
    const monthName = new Intl.DateTimeFormat(locale, {
        month: "long",
        timeZone: "UTC",
        year: "numeric",
    }).format(asDate(`${month}-15`));
    const weekdays = Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short" }).format(
            new Date(asDate(MONDAY).getTime() + index * 86_400_000),
        ),
    );
    const longDate = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });
    const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const withNotes = new Set(noteDays);

    return (
        <section aria-labelledby="calendar-title" className="card calendar">
            <header className="calendar-header">
                <h2 id="calendar-title">{monthName}</h2>
                <nav aria-label={monthName} className="calendar-nav">
                    <Link
                        aria-label={translate(locale, "calendar.previousMonth")}
                        className="icon-button"
                        href={calendarHref(shiftMonth(month, -1))}
                        scroll={false}
                    >
                        <ChevronLeft aria-hidden="true" size={20} />
                    </Link>
                    <Link
                        className="button button-ghost"
                        href={calendarHref(today.slice(0, 7), today)}
                        scroll={false}
                    >
                        {translate(locale, "calendar.today")}
                    </Link>
                    <Link
                        aria-label={translate(locale, "calendar.nextMonth")}
                        className="icon-button"
                        href={calendarHref(shiftMonth(month, 1))}
                        scroll={false}
                    >
                        <ChevronRight aria-hidden="true" size={20} />
                    </Link>
                </nav>
            </header>
            <ol className="calendar-grid">
                {weekdays.map((weekday) => (
                    <li aria-hidden="true" className="calendar-weekday" key={weekday}>
                        {weekday}
                    </li>
                ))}
                {days.map((day) => {
                    const inMonth = day.date.startsWith(month);
                    const hasNote = withNotes.has(day.date);
                    return (
                        <li key={day.date}>
                            <Link
                                aria-current={day.date === selected ? "date" : undefined}
                                aria-label={longDate.format(asDate(day.date))}
                                className="calendar-day"
                                data-outside={!inMonth || undefined}
                                data-today={day.date === today || undefined}
                                href={calendarHref(day.date.slice(0, 7), day.date)}
                                scroll={false}
                            >
                                <span className="calendar-day-number numeric">
                                    {Number(day.date.slice(8))}
                                </span>
                                <span className="calendar-day-stats">
                                    {day.meals > 0 && (
                                        <span className="calendar-stat" data-kind="meal">
                                            {day.meals}
                                        </span>
                                    )}
                                    {day.activeMinutes > 0 && (
                                        <span className="calendar-stat" data-kind="training">
                                            {formatMinutes(day.activeMinutes, locale)}
                                        </span>
                                    )}
                                    {day.sleepMinutes > 0 && (
                                        <span className="calendar-stat" data-kind="sleep">
                                            {decimal.format(day.sleepMinutes / 60)} h
                                        </span>
                                    )}
                                    {day.weightGrams !== null && (
                                        <span className="calendar-stat" data-kind="weight">
                                            {decimal.format(
                                                gramsToUnit(day.weightGrams, weightUnit),
                                            )}
                                        </span>
                                    )}
                                </span>
                                {hasNote && (
                                    <NotebookPen
                                        aria-label={translate(locale, "calendar.hasNote")}
                                        className="calendar-note"
                                        size={14}
                                    />
                                )}
                            </Link>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
