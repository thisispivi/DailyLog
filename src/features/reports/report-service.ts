import PDFDocument from "pdfkit";
import writeExcelFile, { type Cell, type SheetData } from "write-excel-file/node";

import { formatDateTime, formatDuration, formatWeight, translate } from "@/core/i18n/translate";
import type { Entry, Locale, WeighIn, WeightUnit } from "@/features/logbook/domain";

type ReportInput = Readonly<{
    endDate: string;
    entries: Entry[];
    locale: Locale;
    startDate: string;
    timeZone: string;
    weighIns: WeighIn[];
    weightUnit: WeightUnit;
}>;

/** Builds a spreadsheet-safe workbook with separate journal and weight worksheets. */
export async function createWorkbook(input: ReportInput): Promise<Buffer> {
    const journalHeaders = [
        "columnDate",
        "columnType",
        "columnLabel",
        "columnDetails",
        "columnEnd",
        "columnDuration",
    ] as const;
    const journal: SheetData = [
        journalHeaders.map((key) => headerCell(translate(input.locale, `reports.${key}`))),
        ...input.entries.map((entry, index): Cell[] => [
            dataCell(formatDateTime(entry.startAt, input.locale, input.timeZone), index),
            dataCell(translate(input.locale, `dashboard.${entry.kind}`), index),
            dataCell(neutralizeSpreadsheetFormula(entry.label), index),
            dataCell(neutralizeSpreadsheetFormula(entry.text), index),
            dataCell(
                entry.endAt ? formatDateTime(entry.endAt, input.locale, input.timeZone) : "",
                index,
            ),
            dataCell(
                entry.endAt ? formatDuration(entry.startAt, entry.endAt, input.locale) : "",
                index,
            ),
        ]),
    ];
    const weights: SheetData = [
        [
            headerCell(translate(input.locale, "reports.columnDate")),
            headerCell(translate(input.locale, "reports.columnWeight")),
        ],
        ...input.weighIns.map((weighIn, index): Cell[] => [
            dataCell(formatDateTime(weighIn.recordedAt, input.locale, input.timeZone), index),
            dataCell(formatWeight(weighIn.weightGrams, input.weightUnit, input.locale), index),
        ]),
    ];
    return writeExcelFile([
        {
            columns: [
                { width: 23 },
                { width: 15 },
                { width: 23 },
                { width: 48 },
                { width: 23 },
                { width: 16 },
            ],
            data: journal,
            orientation: "landscape",
            sheet: translate(input.locale, "reports.journalSheet"),
            showGridLines: false,
            stickyRowsCount: 1,
        },
        {
            columns: [{ width: 26 }, { width: 18 }],
            data: weights,
            sheet: translate(input.locale, "reports.weightSheet"),
            showGridLines: false,
            stickyRowsCount: 1,
        },
    ]).toBuffer();
}

/** Builds a compact A4 report without interpreting user text as markup. */
export async function createPdf(input: ReportInput): Promise<Buffer> {
    const document = new PDFDocument({ margin: 44, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Buffer>((resolve, reject) => {
        document.on("end", () => resolve(Buffer.concat(chunks)));
        document.on("error", reject);
    });
    document.fillColor("#071b3d").fontSize(24).font("Helvetica-Bold").text("DailyLog");
    document
        .moveDown(0.2)
        .fillColor("#69727d")
        .fontSize(10)
        .font("Helvetica")
        .text(`${input.startDate} – ${input.endDate}`);
    document.moveDown(1.4);
    for (const entry of input.entries) {
        ensurePdfSpace(document, 62);
        document
            .fillColor("#0878f9")
            .fontSize(8)
            .font("Helvetica-Bold")
            .text(translate(input.locale, `dashboard.${entry.kind}`).toUpperCase());
        document.fillColor("#111820").fontSize(12).text(entry.label);
        document
            .fillColor("#69727d")
            .fontSize(9)
            .font("Helvetica")
            .text(formatDateTime(entry.startAt, input.locale, input.timeZone));
        if (entry.text) document.fillColor("#28323c").fontSize(9).text(entry.text, { width: 500 });
        if (entry.endAt)
            document
                .fillColor("#69727d")
                .text(formatDuration(entry.startAt, entry.endAt, input.locale));
        document.moveDown(0.8);
    }
    if (input.weighIns.length) {
        ensurePdfSpace(document, 80);
        document
            .moveDown()
            .fillColor("#071b3d")
            .fontSize(16)
            .font("Helvetica-Bold")
            .text(translate(input.locale, "reports.weightSheet"));
        document.moveDown(0.6);
        for (const weighIn of input.weighIns) {
            ensurePdfSpace(document, 28);
            document
                .fillColor("#111820")
                .fontSize(10)
                .font("Helvetica-Bold")
                .text(formatWeight(weighIn.weightGrams, input.weightUnit, input.locale), {
                    continued: true,
                });
            document
                .fillColor("#69727d")
                .font("Helvetica")
                .text(`   ${formatDateTime(weighIn.recordedAt, input.locale, input.timeZone)}`);
        }
    }
    const pageCount = document.bufferedPageRange().count;
    for (let page = 0; page < pageCount; page += 1) {
        document.switchToPage(page);
        document
            .fillColor("#8a929a")
            .fontSize(8)
            .text(`${page + 1} / ${pageCount}`, 44, 805, { align: "right", width: 507 });
    }
    document.end();
    return completed;
}

function headerCell(value: string): Cell {
    return {
        backgroundColor: "#071B3D",
        fontWeight: "bold",
        height: 24,
        textColor: "#FFFFFF",
        value,
        alignVertical: "center",
    };
}

function dataCell(value: string, index: number): Cell {
    return {
        ...(index % 2 === 1 ? { backgroundColor: "#F3F5F7" } : {}),
        height: 24,
        value,
        alignVertical: "top",
        wrap: true,
    };
}

/** Prevents user-controlled cell text from being interpreted as a spreadsheet formula. */
export function neutralizeSpreadsheetFormula(value: string): string {
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function ensurePdfSpace(document: PDFKit.PDFDocument, height: number): void {
    if (document.y + height > document.page.height - 55) document.addPage();
}
