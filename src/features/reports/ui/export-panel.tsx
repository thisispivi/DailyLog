"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";

import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";

const formats = [
    { icon: FileSpreadsheet, key: "reports.xlsx", value: "xlsx" },
    { icon: FileText, key: "reports.pdf", value: "pdf" },
] as const;

/** A plain GET form, so the browser handles the download natively. */
export function ExportPanel({
    defaultFrom,
    defaultTo,
    locale,
}: Readonly<{ defaultFrom: string; defaultTo: string; locale: Locale }>) {
    const [all, setAll] = useState(false);
    return (
        <section aria-labelledby="export-title" className="export-panel card">
            <p className="eyebrow">{translate(locale, "common.export")}</p>
            <h2 id="export-title">{translate(locale, "reports.dateRange")}</h2>
            <form action="/api/reports/export" method="get">
                <label className="choice-row">
                    <input
                        checked={all}
                        name="all"
                        onChange={(event) => setAll(event.currentTarget.checked)}
                        type="checkbox"
                        value="true"
                    />
                    <span>{translate(locale, "reports.allData")}</span>
                </label>
                <div className="form-grid">
                    <div className="field">
                        <label htmlFor="report-from">{translate(locale, "common.from")}</label>
                        <input
                            className="input"
                            defaultValue={defaultFrom}
                            disabled={all}
                            id="report-from"
                            name="from"
                            required={!all}
                            type="date"
                        />
                    </div>
                    <div className="field">
                        <label htmlFor="report-to">{translate(locale, "common.to")}</label>
                        <input
                            className="input"
                            defaultValue={defaultTo}
                            disabled={all}
                            id="report-to"
                            name="to"
                            required={!all}
                            type="date"
                        />
                    </div>
                </div>
                <fieldset className="format-options">
                    <legend className="field-label">{translate(locale, "reports.format")}</legend>
                    {formats.map(({ icon: Icon, key, value }) => (
                        <label key={value}>
                            <input
                                defaultChecked={value === "xlsx"}
                                name="format"
                                type="radio"
                                value={value}
                            />
                            <Icon aria-hidden="true" size={20} />
                            <span>{translate(locale, key)}</span>
                        </label>
                    ))}
                </fieldset>
                <button className="button button-primary" type="submit">
                    <Download aria-hidden="true" size={17} />
                    {translate(locale, "common.export")}
                </button>
            </form>
        </section>
    );
}
