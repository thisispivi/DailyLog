import writeExcelFile, { type Cell, type SheetData } from "write-excel-file/node";

import { translate } from "@/core/i18n/translate";
import { localInputValue } from "@/core/time/zoned-time";
import { gramsToUnit } from "@/features/logbook/domain";
import { reportDays, summaryTiles, type ReportInput } from "@/features/reports/report-input";
import { kindColors, palette } from "@/features/reports/report-palette";
import type { RecordKind } from "@/ui/kind-icon";

/** Prevents user-controlled cell text from being interpreted as a spreadsheet formula. */
export function neutralizeSpreadsheetFormula(value: string): string {
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Builds the export workbook in the app's palette. The journal sheet reads like
 * the PDF: the period's key figures, then one small table per day with its
 * records and note, skipping days with nothing recorded. The weight sheet keeps
 * real Excel dates and numbers, so it can be sorted and charted.
 */
export async function createWorkbook(input: ReportInput): Promise<Buffer> {
    const t = (key: Parameters<typeof translate>[1]) => translate(input.locale, key);
    const dateFormat = input.locale === "it" ? "dd/mm/yyyy" : "dd mmm yyyy";
    const dateTimeFormat = `${dateFormat} hh:mm`;
    const localDate = (timestamp: string) => wallClock(timestamp, input.timeZone);
    const toUnit = (grams: number) => Math.round(gramsToUnit(grams, input.weightUnit) * 10) / 10;
    const longDate = new Intl.DateTimeFormat(input.locale, { dateStyle: "full", timeZone: "UTC" });

    // A cell with columnSpan is followed by nulls for the columns it covers.
    const journal: SheetData = [
        [title("DailyLog", 4), null, null, null],
        [subtitle(periodLabel(input), 4), null, null, null],
        [],
        ...summaryTiles(input).map((tile) => metricRow(tile.label, tile.value, tile.kind)),
        ...reportDays(input).flatMap(({ date, note, rows }): Cell[][] => [
            [],
            [dayHeading(capitalize(longDate.format(dayDate(date)))), null, null, null],
            ...rows.map((row, index): Cell[] => [
                { ...body(index), fontWeight: "bold", textColor: palette.muted, value: row.time },
                kindCell(row.kind, t(`dashboard.${row.kind}`)),
                {
                    ...body(index),
                    fontWeight: "bold",
                    value: neutralizeSpreadsheetFormula(row.title),
                },
                {
                    ...body(index),
                    textColor: palette.muted,
                    value: neutralizeSpreadsheetFormula(row.detail),
                },
            ]),
            ...(note ? [noteRow(t("export.columnNote"), neutralizeSpreadsheetFormula(note))] : []),
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

    return writeExcelFile([
        {
            columns: [{ width: 14 }, { width: 16 }, { width: 28 }, { width: 70 }],
            data: journal,
            orientation: "landscape",
            sheet: t("reports.journalSheet"),
            showGridLines: false,
        },
        {
            columns: [{ width: 18 }, { width: 14 }, { width: 12 }],
            data: weights,
            orientation: "landscape",
            sheet: t("reports.weightSheet"),
            showGridLines: false,
            stickyRowsCount: 1,
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
        textColor: kindColors[kind].ink,
        value: label,
    };
}

function metricRow(label: string, value: string, kind: RecordKind): Cell[] {
    const colors = kindColors[kind];
    return [
        {
            backgroundColor: colors.tile,
            columnSpan: 2,
            fontWeight: "bold",
            height: 24,
            textColor: colors.ink,
            value: label,
        },
        null,
        {
            backgroundColor: colors.tile,
            fontSize: 13,
            fontWeight: "bold",
            height: 24,
            textColor: palette.text,
            value,
        },
    ];
}

function dayHeading(value: string): Cell {
    return {
        bottomBorderColor: palette.line,
        bottomBorderStyle: "thin",
        columnSpan: 4,
        fontSize: 13,
        fontWeight: "bold",
        height: 26,
        textColor: palette.text,
        value,
    };
}

function noteRow(label: string, text: string): Cell[] {
    const box = { alignVertical: "top", backgroundColor: palette.primarySoft } as const;
    return [
        { ...box, fontWeight: "bold", textColor: palette.primary, value: label.toUpperCase() },
        { ...box, columnSpan: 3, textColor: palette.text, value: text, wrap: true },
        null,
        null,
    ];
}

/**
 * Excel dates carry no time zone, so a timestamp becomes the owner's local wall
 * clock written as if it were UTC; Excel then shows exactly that time.
 */
function wallClock(timestamp: string, timeZone: string): Date {
    return new Date(`${localInputValue(new Date(timestamp), timeZone)}:00Z`);
}

function capitalize(value: string): string {
    return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function dayDate(day: string): Date {
    return new Date(`${day}T00:00:00Z`);
}

/** "7 ottobre 2026 – 9 ottobre 2026", in the export language. */
export function periodLabel({ endDate, locale, startDate }: ReportInput): string {
    const format = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
    return `${format.format(dayDate(startDate))} – ${format.format(dayDate(endDate))}`;
}
