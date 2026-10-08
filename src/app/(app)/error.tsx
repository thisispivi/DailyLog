"use client";

import { translate } from "@/core/i18n/translate";
import { RobotMark } from "@/ui/robot-mark";

// Error boundaries render on the client without server data, so the language
// comes from the <html lang> attribute the root layout already set.
export default function AppError({ reset }: Readonly<{ reset: () => void }>) {
    const locale =
        typeof document !== "undefined" && document.documentElement.lang === "it" ? "it" : "en";
    return (
        <section className="standalone-state" role="alert">
            <div className="state-card card">
                <RobotMark size={72} />
                <h1>{translate(locale, "common.errorPage")}</h1>
                <button className="button button-primary" onClick={reset} type="button">
                    {translate(locale, "common.retry")}
                </button>
            </div>
        </section>
    );
}
