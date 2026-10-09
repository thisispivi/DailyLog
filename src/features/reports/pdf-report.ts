import { existsSync } from "node:fs";
import { join } from "node:path";

import PDFDocument from "pdfkit";

import { formatMinutes, formatTime, formatWeight, translate } from "@/core/i18n/translate";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { clipToDay, dailyTotals, summarizePeriod } from "@/features/insights/insights";
import { entryDisplayLabel } from "@/features/logbook/entry-label";
import { datesInRange, type ReportInput } from "@/features/reports/report-input";
import { kindColors, palette } from "@/features/reports/report-palette";
import type { RecordKind } from "@/ui/kind-icon";

const PAGE_MARGIN = 40;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;
const FOOTER_SPACE = 56;
const TIME_COLUMN = 44;
const PILL_WIDTH = 64;
const TEXT_X = PAGE_MARGIN + TIME_COLUMN + PILL_WIDTH + 12;
const TEXT_WIDTH = CONTENT_WIDTH - (TEXT_X - PAGE_MARGIN);

// The same Nunito the app uses, bundled by @fontsource. WOFF, not WOFF2: PDFKit
// embeds WOFF2 glyphs that PDF viewers draw as blank. Next traces these files
// into the standalone build (next.config.ts); Helvetica is the fallback.
const FONT_DIRECTORY = join(process.cwd(), "node_modules", "@fontsource", "nunito", "files");
const fontFiles = { bold: "700", extraBold: "800", regular: "400" } as const;
type FontWeight = keyof typeof fontFiles;

type DayRow = Readonly<{
    at: string;
    detail: string;
    kind: RecordKind;
    time: string;
    title: string;
}>;

/**
 * Builds the A4 report in the app's soft wellness style: a header band, the
 * period's key figures as tiles, then one section per day with its records and
 * note. Activities that cross midnight appear on each day with that day's part.
 * User text is drawn as plain text, never interpreted as markup.
 */
export async function createPdf(input: ReportInput): Promise<Buffer> {
    const document = new PDFDocument({ bufferPages: true, margin: PAGE_MARGIN, size: "A4" });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Buffer>((resolve, reject) => {
        document.on("end", () => resolve(Buffer.concat(chunks)));
        document.on("error", reject);
    });

    const font = registerFonts(document);
    const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
        translate(input.locale, key, values);
    const longDate = new Intl.DateTimeFormat(input.locale, { dateStyle: "full", timeZone: "UTC" });
    const mediumDate = new Intl.DateTimeFormat(input.locale, {
        dateStyle: "long",
        timeZone: "UTC",
    });
    const period = `${mediumDate.format(asDay(input.startDate))} – ${mediumDate.format(asDay(input.endDate))}`;

    const ensureSpace = (height: number) => {
        if (document.y + height > document.page.height - FOOTER_SPACE) {
            document.addPage();
            document.y = PAGE_MARGIN;
        }
    };

    // Header band
    const headerTop = PAGE_MARGIN;
    document.roundedRect(PAGE_MARGIN, headerTop, CONTENT_WIDTH, 92, 18).fill(palette.canvas);
    drawLogo(document, PAGE_MARGIN + 20, headerTop + 22);
    font("extraBold")
        .fontSize(22)
        .fillColor(palette.text)
        .text("DailyLog", PAGE_MARGIN + 60, headerTop + 20);
    font("bold")
        .fontSize(11)
        .fillColor(palette.muted)
        .text(period, PAGE_MARGIN + 60, headerTop + 50);
    font("regular")
        .fontSize(9)
        .fillColor(palette.muted)
        .text(
            t("export.exportedOn", {
                date: mediumDate.format(asDay(localDateInZone(new Date(), input.timeZone))),
            }),
            PAGE_MARGIN,
            headerTop + 24,
            { align: "right", width: CONTENT_WIDTH - 20 },
        );

    // Summary tiles
    const dates = datesInRange(input.startDate, input.endDate);
    const days = dailyTotals(dates, input.entries, input.weighIns, input.timeZone);
    const summary = summarizePeriod(days);
    const meals = days.reduce((sum, day) => sum + day.meals, 0);
    const tiles: Array<{ kind: RecordKind; label: string; value: string }> = [
        { kind: "meal", label: t("export.totalMeals"), value: String(meals) },
        {
            kind: "training",
            label: t("reports.activeTime"),
            value: formatMinutes(summary.activeMinutes, input.locale),
        },
        {
            kind: "sleep",
            label: t("reports.averageSleep"),
            value:
                summary.averageSleepMinutes === null
                    ? "–"
                    : formatMinutes(summary.averageSleepMinutes, input.locale),
        },
        {
            kind: "weight",
            label: t("reports.weightChange"),
            value:
                summary.weightChangeGrams === null
                    ? "–"
                    : `${summary.weightChangeGrams > 0 ? "+" : summary.weightChangeGrams < 0 ? "−" : "±"}${formatWeight(Math.abs(summary.weightChangeGrams), input.weightUnit, input.locale)}`,
        },
    ];
    const tileGap = 10;
    const tileWidth = (CONTENT_WIDTH - tileGap * (tiles.length - 1)) / tiles.length;
    const tilesTop = headerTop + 108;
    tiles.forEach((tile, index) => {
        const x = PAGE_MARGIN + index * (tileWidth + tileGap);
        const colors = kindColors[tile.kind];
        document.roundedRect(x, tilesTop, tileWidth, 64, 14).fill(colors.tile);
        font("bold")
            .fontSize(8.5)
            .fillColor(colors.ink)
            .text(tile.label, x + 12, tilesTop + 12, {
                width: tileWidth - 24,
            });
        font("extraBold")
            .fontSize(15)
            .fillColor(palette.text)
            .text(tile.value, x + 12, tilesTop + 34, {
                lineBreak: false,
                width: tileWidth - 24,
            });
    });
    document.y = tilesTop + 64 + 26;

    // One section per day with something to show
    const notes = new Map(input.notes.map((note) => [note.day, note.text]));
    for (const date of dates) {
        const rows = rowsForDay(input, date);
        const note = notes.get(date);
        if (rows.length === 0 && !note) continue;

        ensureSpace(64);
        font("extraBold")
            .fontSize(13)
            .fillColor(palette.text)
            .text(capitalize(longDate.format(asDay(date))), PAGE_MARGIN, document.y);
        const ruleY = document.y + 4;
        document
            .moveTo(PAGE_MARGIN, ruleY)
            .lineTo(PAGE_MARGIN + CONTENT_WIDTH, ruleY)
            .lineWidth(1)
            .strokeColor(palette.line)
            .stroke();
        document.y = ruleY + 10;

        for (const row of rows) {
            font("regular").fontSize(9);
            const detailHeight = row.detail
                ? document.heightOfString(row.detail, { width: TEXT_WIDTH })
                : 0;
            const rowHeight = Math.max(30, 16 + detailHeight + 8);
            ensureSpace(rowHeight);
            const top = document.y;
            const colors = kindColors[row.kind];
            font("bold")
                .fontSize(9)
                .fillColor(palette.muted)
                .text(row.time, PAGE_MARGIN, top + 2, {
                    width: TIME_COLUMN,
                });
            document
                .roundedRect(PAGE_MARGIN + TIME_COLUMN, top, PILL_WIDTH, 16, 8)
                .fill(colors.tile);
            font("extraBold")
                .fontSize(7.5)
                .fillColor(colors.ink)
                .text(
                    t(`dashboard.${row.kind}`).toUpperCase(),
                    PAGE_MARGIN + TIME_COLUMN,
                    top + 4,
                    {
                        align: "center",
                        lineBreak: false,
                        width: PILL_WIDTH,
                    },
                );
            font("bold").fontSize(10.5).fillColor(palette.text).text(row.title, TEXT_X, top, {
                lineBreak: false,
                width: TEXT_WIDTH,
            });
            if (row.detail) {
                font("regular")
                    .fontSize(9)
                    .fillColor(palette.muted)
                    .text(row.detail, TEXT_X, top + 15, {
                        width: TEXT_WIDTH,
                    });
            }
            document.y = top + rowHeight;
        }

        if (note) {
            font("regular").fontSize(9.5);
            const noteHeight = document.heightOfString(note, { width: CONTENT_WIDTH - 32 });
            const boxHeight = noteHeight + 34;
            ensureSpace(boxHeight + 8);
            const top = document.y + 2;
            document
                .roundedRect(PAGE_MARGIN, top, CONTENT_WIDTH, boxHeight, 12)
                .fill(palette.primarySoft);
            document.roundedRect(PAGE_MARGIN, top, 4, boxHeight, 2).fill(palette.primary);
            font("extraBold")
                .fontSize(8)
                .fillColor(palette.primary)
                .text(t("export.columnNote").toUpperCase(), PAGE_MARGIN + 16, top + 10);
            font("regular")
                .fontSize(9.5)
                .fillColor(palette.text)
                .text(note, PAGE_MARGIN + 16, top + 24, {
                    width: CONTENT_WIDTH - 32,
                });
            document.y = top + boxHeight + 8;
        }
        document.y += 14;
    }

    // Footer on every page
    const pages = document.bufferedPageRange().count;
    for (let page = 0; page < pages; page += 1) {
        document.switchToPage(page);
        // Without this, text below the bottom margin makes PDFKit add a new page.
        document.page.margins.bottom = 0;
        const footerY = document.page.height - 36;
        font("bold")
            .fontSize(8)
            .fillColor(palette.muted)
            .text(`DailyLog · ${period}`, PAGE_MARGIN, footerY, {
                lineBreak: false,
                width: CONTENT_WIDTH / 2,
            });
        document.text(`${page + 1} / ${pages}`, PAGE_MARGIN, footerY, {
            align: "right",
            lineBreak: false,
            width: CONTENT_WIDTH,
        });
    }
    document.end();
    return completed;
}

/** The records that belong to one local day, in time order. */
function rowsForDay(input: ReportInput, date: string): DayRow[] {
    const [dayStart, dayEnd] = localDateRangeBounds(date, date, input.timeZone);
    const time = (value: string) => formatTime(value, input.locale, input.timeZone);
    const inDay = (timestamp: string) =>
        Date.parse(timestamp) >= Date.parse(dayStart) && Date.parse(timestamp) < Date.parse(dayEnd);
    const rows: DayRow[] = [];

    for (const entry of input.entries) {
        const title = entryDisplayLabel(entry, input.locale);
        if (entry.kind === "meal") {
            if (inDay(entry.startAt)) {
                rows.push({
                    at: entry.startAt,
                    detail: entry.text,
                    kind: "meal",
                    time: time(entry.startAt),
                    title,
                });
            }
            continue;
        }
        const end = entry.endAt ?? new Date().toISOString();
        if (
            Date.parse(entry.startAt) >= Date.parse(dayEnd) ||
            Date.parse(end) <= Date.parse(dayStart)
        ) {
            continue;
        }
        const segment = clipToDay(entry, dayStart, dayEnd);
        const until = segment.intoNextDay
            ? time(new Date(Date.parse(dayEnd) - 60_000).toISOString())
            : segment.endAt
              ? time(segment.endAt)
              : translate(input.locale, "dashboard.inProgress");
        const minutes = (Date.parse(segment.endAt ?? end) - Date.parse(segment.startAt)) / 60_000;
        const detail = [
            `${time(segment.startAt)}–${until}`,
            formatMinutes(minutes, input.locale),
            entry.text,
        ]
            .filter(Boolean)
            .join(" · ");
        rows.push({
            at: segment.startAt,
            detail,
            kind: entry.kind,
            time: time(segment.startAt),
            title,
        });
    }

    for (const weighIn of input.weighIns) {
        if (!inDay(weighIn.recordedAt)) continue;
        rows.push({
            at: weighIn.recordedAt,
            detail: "",
            kind: "weight",
            time: time(weighIn.recordedAt),
            title: formatWeight(weighIn.weightGrams, input.weightUnit, input.locale),
        });
    }
    return rows.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

/** Registers Nunito when its files are present and returns a font switcher. */
function registerFonts(document: PDFKit.PDFDocument): (weight: FontWeight) => PDFKit.PDFDocument {
    const available = Object.entries(fontFiles).every(([, weight]) =>
        existsSync(join(FONT_DIRECTORY, `nunito-latin-${weight}-normal.woff`)),
    );
    if (available) {
        for (const [name, weight] of Object.entries(fontFiles)) {
            document.registerFont(name, join(FONT_DIRECTORY, `nunito-latin-${weight}-normal.woff`));
        }
        return (weight) => document.font(weight);
    }
    return (weight) => document.font(weight === "regular" ? "Helvetica" : "Helvetica-Bold");
}

/** The app icon: a pulse line in a violet rounded square. */
function drawLogo(document: PDFKit.PDFDocument, x: number, y: number): void {
    const size = 30;
    const scale = size / 64;
    document.roundedRect(x, y, size, size, 9).fill(palette.primary);
    const points: Array<[number, number]> = [
        [12, 34],
        [21, 34],
        [26, 22],
        [35, 44],
        [41, 30],
        [52, 30],
    ];
    const [first, ...rest] = points.map(([px, py]) => [x + px * scale, y + py * scale] as const);
    if (!first) return;
    document.moveTo(first[0], first[1]);
    for (const [px, py] of rest) document.lineTo(px, py);
    document.lineWidth(2.4).lineCap("round").lineJoin("round").strokeColor("#FFFFFF").stroke();
}

function asDay(date: string): Date {
    return new Date(`${date}T12:00:00Z`);
}

function capitalize(value: string): string {
    return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
