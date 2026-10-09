import PDFDocument from "pdfkit";

import { formatDateTime, formatDuration, formatWeight, translate } from "@/core/i18n/translate";
import { entryDisplayLabel } from "@/features/logbook/entry-label";
import type { ReportInput } from "@/features/reports/report-input";

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
        document.fillColor("#111820").fontSize(12).text(entryDisplayLabel(entry, input.locale));
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

function ensurePdfSpace(document: PDFKit.PDFDocument, height: number): void {
    if (document.y + height > document.page.height - 55) document.addPage();
}
