"use client";

import { Footprints } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import { type DayLog, type Locale, MAX_DAILY_STEPS } from "@/features/logbook/domain";
import type { DayLogChanges } from "@/features/logbook/schemas";

import "./day-log-card.css";

type Status = { message: string; tone: "error" | "success" } | null;

/** The day's step count. Saves when the field loses focus; no save button. */
export function DayLogCard({
    day,
    initial,
    locale,
}: Readonly<{ day: string; initial: DayLog | null; locale: Locale }>) {
    const router = useRouter();
    const [steps, setSteps] = useState(initial?.steps ?? null);
    const [status, setStatus] = useState<Status>(null);

    async function save(changes: DayLogChanges) {
        const { ok, status: code } = await sendJson(`/api/days/${day}`, "PATCH", changes);
        setStatus({
            message: translate(
                locale,
                ok ? "common.saved" : code === 400 ? "common.validation" : "common.error",
            ),
            tone: ok ? "success" : "error",
        });
        if (ok) router.refresh();
        return ok;
    }

    async function saveSteps(value: string) {
        const next = value ? Number(value) : null;
        if (next !== steps && (await save({ steps: next }))) setSteps(next);
    }

    return (
        <section aria-labelledby={`day-log-title-${day}`} className="card day-log">
            <div className="card-heading">
                <h2 id={`day-log-title-${day}`}>
                    <Footprints aria-hidden="true" size={20} />
                    {translate(locale, "dayLog.steps")}
                </h2>
                <p aria-live="polite" className="status-message" data-tone={status?.tone}>
                    {status?.message}
                </p>
            </div>
            <div className="field">
                <label className="sr-only" htmlFor={`day-steps-${day}`}>
                    {translate(locale, "dayLog.steps")}
                </label>
                <input
                    aria-describedby={`day-steps-hint-${day}`}
                    className="input numeric"
                    defaultValue={steps ?? ""}
                    id={`day-steps-${day}`}
                    inputMode="numeric"
                    max={MAX_DAILY_STEPS}
                    min={0}
                    onBlur={(event) => void saveSteps(event.currentTarget.value)}
                    step={1}
                    type="number"
                />
                <p className="muted" id={`day-steps-hint-${day}`}>
                    {translate(locale, "dayLog.stepsHint")}
                </p>
            </div>
        </section>
    );
}
