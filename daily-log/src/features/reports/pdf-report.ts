import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import PDFDocument from "pdfkit";

import { translate } from "@/core/i18n/translate";
import { localDateInZone } from "@/core/time/zoned-time";
import {
    profileLine,
    reportDays,
    summaryTiles,
    type ReportInput,
} from "@/features/reports/report-input";
import { kindColors, palette } from "@/features/reports/report-palette";

const PAGE_MARGIN = 40;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;
const FOOTER_SPACE = 56;
// Wide enough for a range such as "01:30–09:00".
const TIME_COLUMN = 66;
const PILL_WIDTH = 64;
const TEXT_X = PAGE_MARGIN + TIME_COLUMN + PILL_WIDTH + 12;
const TEXT_WIDTH = CONTENT_WIDTH - (TEXT_X - PAGE_MARGIN);

// Nunito, as in the app (OFL, see fonts/OFL.txt). WOFF rather than WOFF2: PDFKit
// embeds WOFF2 glyphs that PDF viewers draw as blank. new URL(..., import.meta.url)
// lets the bundler copy exactly these files into the build.
const fontFiles = {
    bold: new URL("./fonts/nunito-latin-700-normal.woff", import.meta.url),
    extraBold: new URL("./fonts/nunito-latin-800-normal.woff", import.meta.url),
    regular: new URL("./fonts/nunito-latin-400-normal.woff", import.meta.url),
} as const;
type FontWeight = keyof typeof fontFiles;

/**
 * Builds the A4 report in the app's soft wellness style: a header band, the
 * period's key figures as tiles, then one section per day with its records and
 * note. User text is drawn as plain text, never interpreted as markup.
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
    const person = profileLine(input);
    if (person) {
        font("regular")
            .fontSize(9.5)
            .fillColor(palette.muted)
            .text(person, PAGE_MARGIN + 60, headerTop + 67, {
                lineBreak: false,
                width: CONTENT_WIDTH - 80,
            });
    }
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
    const tiles = summaryTiles(input);
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
    for (const { date, note, rows } of reportDays(input)) {
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
                    lineBreak: false,
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

/** Registers Nunito when its files are readable, otherwise falls back to Helvetica. */
function registerFonts(document: PDFKit.PDFDocument): (weight: FontWeight) => PDFKit.PDFDocument {
    try {
        for (const [name, url] of Object.entries(fontFiles)) {
            document.registerFont(name, readFileSync(fileURLToPath(url)));
        }
        return (weight) => document.font(weight);
    } catch {
        return (weight) => document.font(weight === "regular" ? "Helvetica" : "Helvetica-Bold");
    }
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
