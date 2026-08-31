"use client";

import { useEffect } from "react";

import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";

export default function AppError({
    error,
    reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
    useEffect(() => {
        console.error("Authenticated page failed", { digest: error.digest, name: error.name });
    }, [error]);
    const locale: Locale =
        typeof document !== "undefined" && document.documentElement.lang === "it" ? "it" : "en";
    return (
        <section className="standalone-state" role="alert">
            <div className="surface raised">
                <p className="eyebrow">DailyLog</p>
                <h1>{translate(locale, "common.errorPage")}</h1>
                <button className="button button-primary" onClick={reset} type="button">
                    {translate(locale, "common.retry")}
                </button>
            </div>
        </section>
    );
}
