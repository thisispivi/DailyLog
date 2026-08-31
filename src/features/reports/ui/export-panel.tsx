"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";

export function ExportPanel({
    defaultFrom,
    defaultTo,
    locale,
}: Readonly<{ defaultFrom: string; defaultTo: string; locale: Locale }>) {
    const [all, setAll] = useState(false);
    return (
        <section className="export-panel surface">
            <div>
                <p className="eyebrow">{translate(locale, "common.export")}</p>
                <h2>{translate(locale, "reports.dateRange")}</h2>
            </div>
            <form action="/api/reports/export" method="get">
                <label className="choice-row">
                    <input
                        checked={all}
                        name="all"
                        onChange={(event) => setAll(event.currentTarget.checked)}
                        type="checkbox"
                        value="true"
                    />
                    <span>
                        <strong>{translate(locale, "reports.allData")}</strong>
                    </span>
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
                    <legend>{translate(locale, "reports.format")}</legend>
                    <label>
                        <input defaultChecked name="format" type="radio" value="xlsx" />
                        <span>
                            <strong>{translate(locale, "reports.xlsx")}</strong>
                        </span>
                    </label>
                    <label>
                        <input name="format" type="radio" value="pdf" />
                        <span>
                            <strong>{translate(locale, "reports.pdf")}</strong>
                        </span>
                    </label>
                </fieldset>
                <button className="button button-primary" type="submit">
                    <Download aria-hidden="true" size={17} />
                    {translate(locale, "common.export")}
                </button>
            </form>
        </section>
    );
}
