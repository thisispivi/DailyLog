import writeExcelFile, { type Cell, type SheetData } from "write-excel-file/node";

import { formatMinutes, translate } from "@/core/i18n/translate";
import { localInputValue } from "@/core/time/zoned-time";
import { dailyTotals, summarizePeriod } from "@/features/insights/insights";
import { entryDurationMs, gramsToUnit, type Entry } from "@/features/logbook/domain";
import { entryDisplayLabel } from "@/features/logbook/entry-label";
import { datesInRange, type ReportInput } from "@/features/reports/report-input";
import { kindColors, palette } from "@/features/reports/report-palette";
import type { RecordKind } from "@/ui/kind-icon";

const ROW_HEIGHT = 22;

/** Prevents user-controlled cell text from being interpreted as a spreadsheet formula. */
export function neutralizeSpreadsheetFormula(value: string): string {
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Builds the export workbook in the app's palette: a summary sheet with one row
 * per day, then the journal, weigh-ins, and notes. Dates are real Excel dates in
 * the owner's local time, and durations are minutes, so the file can be sorted,
 * filtered, and charted.
 */
export async function createWorkbook(input: ReportInput): Promise<Buffer> {
    const t = (key: Parameters<typeof translate>[1]) => translate(input.locale, key);
    const dateFormat = input.locale === "it" ? "dd/mm/yyyy" : "dd mmm yyyy";
    const dateTimeFormat = `${dateFormat} hh:mm`;
    const localDate = (timestamp: string) => wallClock(timestamp, input.timeZone);
    const decimal = new Intl.NumberFormat(input.locale, { maximumFractionDigits: 1 });

    const dates = datesInRange(input.startDate, input.endDate);
    const days = dailyTotals(dates, input.entries, input.weighIns, input.timeZone);
    const summary = summarizePeriod(days);
    const toUnit = (grams: number) => Math.round(gramsToUnit(grams, input.weightUnit) * 10) / 10;
    const noteDays = new Set(input.notes.map((note) => note.day));

    const summarySheet: SheetData = [
        [title("DailyLog", 7)],
        [subtitle(periodLabel(input), 7)],
        [],
        // A cell with columnSpan is followed by nulls for the columns it covers.
        [header(t("export.metric")), header(t("export.value"), 2), null],
        metricRow(
            t("export.totalMeals"),
            String(days.reduce((sum, day) => sum + day.meals, 0)),
            "meal",
        ),
        metricRow(t("reports.mealsPerDay"), decimal.format(summary.mealsPerDay), "meal"),
        metricRow(
            t("reports.activeTime"),
            formatMinutes(summary.activeMinutes, input.locale),
            "training",
        ),
        metricRow(
            t("reports.averageSleep"),
            summary.averageSleepMinutes === null
                ? "–"
                : formatMinutes(summary.averageSleepMinutes, input.locale),
            "sleep",
        ),
        metricRow(
            t("reports.weightChange"),
            summary.weightChangeGrams === null
                ? "–"
                : `${decimal.format(toUnit(summary.weightChangeGrams))} ${input.weightUnit}`,
            "weight",
        ),
        metricRow(t("export.daysWithNotes"), String(noteDays.size)),
        [],
        [
            header(t("reports.columnDate")),
            header(t("export.columnMeals")),
            header(t("export.columnActive")),
            header(t("export.columnSleep")),
            header(`${t("reports.columnWeight")} (${input.weightUnit})`),
            header(t("export.columnNote")),
        ],
        ...days.map((day, index): Cell[] => [
            { ...body(index), format: dateFormat, type: Date, value: dayDate(day.date) },
            { ...body(index), type: Number, value: day.meals },
            { ...body(index), type: Number, value: day.activeMinutes },
            {
                ...body(index),
                format: "0.0",
                type: Number,
                value: Math.round((day.sleepMinutes / 60) * 10) / 10,
            },
            day.weightGrams === null
                ? body(index)
                : { ...body(index), format: "0.0", type: Number, value: toUnit(day.weightGrams) },
            { ...body(index), align: "center", value: noteDays.has(day.date) ? "✓" : "" },
        ]),
    ];

    const journal: SheetData = [
        [
            header(t("reports.columnDate")),
            header(t("reports.columnType")),
            header(t("reports.columnLabel")),
            header(t("reports.columnDetails")),
            header(t("reports.columnEnd")),
            header(t("export.columnMinutes")),
        ],
        ...input.entries.map((entry, index): Cell[] => [
            { ...body(index), format: dateTimeFormat, type: Date, value: localDate(entry.startAt) },
            kindCell(entry.kind, t(`dashboard.${entry.kind}`)),
            {
                ...body(index),
                fontWeight: "bold",
                value: neutralizeSpreadsheetFormula(entryDisplayLabel(entry, input.locale)),
            },
            { ...body(index), value: neutralizeSpreadsheetFormula(entry.text) },
            entry.endAt
                ? {
                      ...body(index),
                      format: dateTimeFormat,
                      type: Date,
                      value: localDate(entry.endAt),
                  }
                : body(index),
            minutesCell(entry, index),
        ]),
    ];

    const weights: SheetData = [
        [
            header(t("reports.columnDate")),
            header(`${t("reports.columnWeight")} (${input.weightUnit})`),
            header(t("export.columnChange")),
        ],
        ...input.weighIns.map((weighIn, index): Cell[] => {
            const previous = input.weighIns[index - 1];
            const change = previous
                ? toUnit(weighIn.weightGrams) - toUnit(previous.weightGrams)
                : null;
            return [
                {
                    ...body(index),
                    format: dateTimeFormat,
                    type: Date,
                    value: localDate(weighIn.recordedAt),
                },
                {
                    ...body(index),
                    fontWeight: "bold",
                    format: "0.0",
                    textColor: kindColors.weight.ink,
                    type: Number,
                    value: toUnit(weighIn.weightGrams),
                },
                change === null
                    ? body(index)
                    : {
                          ...body(index),
                          format: "+0.0;-0.0;0.0",
                          type: Number,
                          value: Math.round(change * 10) / 10,
                      },
            ];
        }),
    ];

    const notes: SheetData = [
        [header(t("reports.columnDate")), header(t("export.columnNote"))],
        ...input.notes.map((note, index): Cell[] => [
            { ...body(index), format: dateFormat, type: Date, value: dayDate(note.day) },
            { ...body(index), value: neutralizeSpreadsheetFormula(note.text) },
        ]),
    ];

    const sheet = {
        orientation: "landscape" as const,
        showGridLines: false,
        stickyRowsCount: 1,
    };
    return writeExcelFile([
        {
            ...sheet,
            columns: [
                { width: 18 },
                { width: 10 },
                { width: 14 },
                { width: 12 },
                { width: 14 },
                { width: 8 },
                { width: 4 },
            ],
            data: summarySheet,
            sheet: t("export.summarySheet"),
            stickyRowsCount: 0,
        },
        {
            ...sheet,
            columns: [
                { width: 18 },
                { width: 14 },
                { width: 24 },
                { width: 52 },
                { width: 18 },
                { width: 10 },
            ],
            data: journal,
            sheet: t("reports.journalSheet"),
        },
        {
            ...sheet,
            columns: [{ width: 18 }, { width: 14 }, { width: 12 }],
            data: weights,
            sheet: t("reports.weightSheet"),
        },
        {
            ...sheet,
            columns: [{ width: 16 }, { width: 90 }],
            data: notes,
            sheet: t("export.notesSheet"),
        },
    ]).toBuffer();
}

function title(value: string, span: number): Cell {
    return {
        columnSpan: span,
        fontSize: 22,
        fontWeight: "bold",
        height: 36,
        textColor: palette.primary,
        value,
    };
}

function subtitle(value: string, span: number): Cell {
    return { columnSpan: span, fontSize: 11, height: 20, textColor: palette.muted, value };
}

function header(value: string, span = 1): Cell {
    return {
        alignVertical: "center",
        backgroundColor: palette.primarySoft,
        bottomBorderColor: palette.primary,
        bottomBorderStyle: "thin",
        columnSpan: span,
        fontWeight: "bold",
        height: 26,
        textColor: palette.primary,
        value,
    };
}

function body(index: number): Cell {
    return {
        alignVertical: "top",
        backgroundColor: index % 2 === 1 ? palette.stripe : palette.surface,
        bottomBorderColor: palette.line,
        bottomBorderStyle: "hair",
        height: ROW_HEIGHT,
        textColor: palette.text,
        value: "",
        wrap: true,
    };
}

function kindCell(kind: RecordKind, label: string): Cell {
    return {
        align: "center",
        alignVertical: "top",
        backgroundColor: kindColors[kind].tile,
        bottomBorderColor: palette.surface,
        bottomBorderStyle: "thin",
        fontWeight: "bold",
        height: ROW_HEIGHT,
        textColor: kindColors[kind].ink,
        value: label,
    };
}

function metricRow(label: string, value: string, kind?: RecordKind): Cell[] {
    const colors = kind ? kindColors[kind] : { ink: palette.primary, tile: palette.canvas };
    return [
        {
            backgroundColor: colors.tile,
            fontWeight: "bold",
            height: 24,
            textColor: colors.ink,
            value: label,
        },
        {
            backgroundColor: colors.tile,
            columnSpan: 2,
            fontSize: 13,
            fontWeight: "bold",
            height: 24,
            textColor: palette.text,
            value,
        },
        null,
    ];
}

function minutesCell(entry: Entry, index: number): Cell {
    if (entry.kind === "meal" || !entry.endAt) return body(index);
    return { ...body(index), type: Number, value: Math.round(entryDurationMs(entry) / 60_000) };
}

/**
 * Excel dates carry no time zone, so a timestamp becomes the owner's local wall
 * clock written as if it were UTC; Excel then shows exactly that time.
 */
function wallClock(timestamp: string, timeZone: string): Date {
    return new Date(`${localInputValue(new Date(timestamp), timeZone)}:00Z`);
}

function dayDate(day: string): Date {
    return new Date(`${day}T00:00:00Z`);
}

/** "7 ottobre 2026 – 9 ottobre 2026", in the export language. */
export function periodLabel({ endDate, locale, startDate }: ReportInput): string {
    const format = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
    return `${format.format(dayDate(startDate))} – ${format.format(dayDate(endDate))}`;
}
