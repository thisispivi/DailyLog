"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";

import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";
import { DateTimeField } from "@/ui/date-time-field";

/**
 * A plain GET form, so the browser handles the download natively. Each format
 * has its own submit button, which makes exporting a single click.
 */
export function ExportPanel({
    defaultFrom,
    defaultTo,
    locale,
    timeZone,
}: Readonly<{ defaultFrom: string; defaultTo: string; locale: Locale; timeZone: string }>) {
    const [all, setAll] = useState(false);
    return (
        <section aria-labelledby="export-title" className="export-panel card">
            <p className="eyebrow">{translate(locale, "common.export")}</p>
            <h2 id="export-title">{translate(locale, "reports.dateRange")}</h2>
            <form action="/api/reports/export" method="get">
                <label className="switch-row">
                    {translate(locale, "reports.allData")}
                    <input
                        checked={all}
                        className="switch"
                        name="all"
                        onChange={(event) => setAll(event.currentTarget.checked)}
                        type="checkbox"
                        value="true"
                    />
                </label>
                <DateTimeField
                    defaultValue={defaultFrom}
                    disabled={all}
                    id="report-from"
                    label={translate(locale, "common.from")}
                    locale={locale}
                    mode="date"
                    name="from"
                    timeZone={timeZone}
                />
                <DateTimeField
                    defaultValue={defaultTo}
                    disabled={all}
                    id="report-to"
                    label={translate(locale, "common.to")}
                    locale={locale}
                    mode="date"
                    name="to"
                    timeZone={timeZone}
                />
                <div className="export-actions">
                    <button
                        className="button button-primary"
                        name="format"
                        type="submit"
                        value="xlsx"
                    >
                        <FileSpreadsheet aria-hidden="true" size={18} />
                        {translate(locale, "reports.downloadXlsx")}
                    </button>
                    <button className="button" name="format" type="submit" value="pdf">
                        <FileText aria-hidden="true" size={18} />
                        {translate(locale, "reports.downloadPdf")}
                    </button>
                </div>
            </form>
        </section>
    );
}
