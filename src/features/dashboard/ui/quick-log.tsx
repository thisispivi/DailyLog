"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import { localInputToUtc, localInputValue } from "@/core/time/zoned-time";
import type { Locale, WeightUnit } from "@/features/logbook/domain";
import { KindIcon, type RecordKind } from "@/ui/kind-icon";

const modes: readonly RecordKind[] = ["meal", "training", "sleep", "weight"];

// Meal labels are stored in English, as the Telegram bot did, and translated on display.
const mealLabels = [
    ["Breakfast", "entry.breakfast"],
    ["Snack 1", "entry.snack1"],
    ["Lunch", "entry.lunch"],
    ["Snack 2", "entry.snack2"],
    ["Dinner", "entry.dinner"],
] as const;

const trainingSuggestions = ["walk", "run", "gym", "tennis", "tableTennis"] as const;

type Status = { message: string; tone: "error" | "success" } | null;

export function QuickLog({
    hasActiveActivity,
    locale,
    timeZone,
    weightUnit,
}: Readonly<{
    hasActiveActivity: boolean;
    locale: Locale;
    timeZone: string;
    weightUnit: WeightUnit;
}>) {
    const router = useRouter();
    const [mode, setMode] = useState<RecordKind>("meal");
    const [pending, setPending] = useState(false);
    const [status, setStatus] = useState<Status>(null);
    const defaultTime = useMemo(() => localInputValue(new Date(), timeZone), [timeZone]);
    const isActivity = mode === "training" || mode === "sleep";
    const blocked = isActivity && hasActiveActivity;

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const field = (name: string) => String(form.get(name) ?? "");
        const startAt = localInputToUtc(field("startAt"), timeZone);
        setPending(true);
        setStatus(null);
        const { ok } =
            mode === "weight"
                ? await sendJson("/api/weigh-ins", "POST", {
                      recordedAt: startAt,
                      unit: weightUnit,
                      weight: Number(field("weight")),
                  })
                : await sendJson("/api/entries", "POST", {
                      endAt: field("endAt") ? localInputToUtc(field("endAt"), timeZone) : null,
                      kind: mode,
                      label: field("label"),
                      startAt,
                      text: field("text"),
                  });
        setPending(false);
        if (!ok) {
            setStatus({ message: translate(locale, "common.error"), tone: "error" });
            return;
        }
        formElement.reset();
        setStatus({ message: translate(locale, "common.saved"), tone: "success" });
        router.refresh();
    }

    return (
        <section aria-labelledby="quick-log-title" className="quick-log card" data-kind={mode}>
            <div className="card-heading">
                <h2 id="quick-log-title">{translate(locale, "dashboard.quickAdd")}</h2>
            </div>
            <div
                className="mode-switch"
                role="group"
                aria-label={translate(locale, "dashboard.recordType")}
            >
                {modes.map((value) => (
                    <button
                        aria-pressed={mode === value}
                        className="mode-button"
                        data-kind={value}
                        key={value}
                        onClick={() => {
                            setMode(value);
                            setStatus(null);
                        }}
                        type="button"
                    >
                        <span className="mode-icon">
                            <KindIcon kind={value} size="small" />
                        </span>
                        {translate(locale, `dashboard.${value}`)}
                    </button>
                ))}
            </div>
            <form className="quick-form" key={mode} onSubmit={save}>
                {mode === "meal" && <MealFields defaultTime={defaultTime} locale={locale} />}
                {isActivity && (
                    <ActivityFields
                        defaultTime={defaultTime}
                        disabled={blocked}
                        locale={locale}
                        mode={mode}
                    />
                )}
                {mode === "weight" && (
                    <WeightFields defaultTime={defaultTime} locale={locale} unit={weightUnit} />
                )}
                {blocked && (
                    <p className="quick-hint">{translate(locale, "dashboard.activityBlocked")}</p>
                )}
                <div className="quick-submit-row">
                    <p aria-live="polite" className="status-message" data-tone={status?.tone}>
                        {status?.message}
                    </p>
                    <button
                        className="button button-primary"
                        disabled={pending || blocked}
                        type="submit"
                    >
                        {translate(locale, isActivity ? "common.start" : "common.add")}
                    </button>
                </div>
            </form>
        </section>
    );
}

function TimeField({
    defaultTime,
    disabled = false,
    id,
    locale,
}: Readonly<{ defaultTime: string; disabled?: boolean; id: string; locale: Locale }>) {
    return (
        <div className="field">
            <label htmlFor={id}>{translate(locale, "entry.startTime")}</label>
            <input
                className="input"
                defaultValue={defaultTime}
                disabled={disabled}
                id={id}
                name="startAt"
                required
                type="datetime-local"
            />
        </div>
    );
}

function MealFields({ defaultTime, locale }: Readonly<{ defaultTime: string; locale: Locale }>) {
    return (
        <div className="quick-fields">
            <div className="field">
                <label htmlFor="meal-label">{translate(locale, "entry.mealType")}</label>
                <select className="select" defaultValue="Lunch" id="meal-label" name="label">
                    {mealLabels.map(([value, key]) => (
                        <option key={value} value={value}>
                            {translate(locale, key)}
                        </option>
                    ))}
                </select>
            </div>
            <TimeField defaultTime={defaultTime} id="meal-start" locale={locale} />
            <div className="field quick-wide">
                <label htmlFor="meal-text">{translate(locale, "common.details")}</label>
                <input
                    className="input"
                    id="meal-text"
                    maxLength={2000}
                    name="text"
                    placeholder={translate(locale, "dashboard.mealDetails")}
                    required
                />
            </div>
        </div>
    );
}

function ActivityFields({
    defaultTime,
    disabled,
    locale,
    mode,
}: Readonly<{
    defaultTime: string;
    disabled: boolean;
    locale: Locale;
    mode: "sleep" | "training";
}>) {
    return (
        <div className="quick-fields">
            {mode === "training" ? (
                <div className="field quick-wide">
                    <label htmlFor="activity-label">
                        {translate(locale, "entry.trainingType")}
                    </label>
                    <input
                        className="input"
                        disabled={disabled}
                        id="activity-label"
                        list="activity-suggestions"
                        maxLength={120}
                        name="label"
                        required
                    />
                    <datalist id="activity-suggestions">
                        {trainingSuggestions.map((key) => (
                            <option key={key} value={translate(locale, `entry.${key}`)} />
                        ))}
                    </datalist>
                </div>
            ) : (
                <input name="label" type="hidden" value="Sleep" />
            )}
            <TimeField
                defaultTime={defaultTime}
                disabled={disabled}
                id="activity-start"
                locale={locale}
            />
            <div className="field">
                <label htmlFor="activity-end">
                    {translate(locale, "entry.endTime")} · {translate(locale, "common.optional")}
                </label>
                <input
                    className="input"
                    disabled={disabled}
                    id="activity-end"
                    name="endAt"
                    type="datetime-local"
                />
            </div>
            <div className="field quick-wide">
                <label htmlFor="activity-text">{translate(locale, "common.details")}</label>
                <input
                    className="input"
                    disabled={disabled}
                    id="activity-text"
                    maxLength={2000}
                    name="text"
                />
            </div>
        </div>
    );
}

function WeightFields({
    defaultTime,
    locale,
    unit,
}: Readonly<{ defaultTime: string; locale: Locale; unit: WeightUnit }>) {
    return (
        <div className="quick-fields">
            <div className="field">
                <label htmlFor="weight-value">
                    {translate(locale, "entry.weightValue")} ({unit})
                </label>
                <input
                    className="input"
                    id="weight-value"
                    inputMode="decimal"
                    max="1000"
                    min="1"
                    name="weight"
                    required
                    step="0.01"
                    type="number"
                />
            </div>
            <TimeField defaultTime={defaultTime} id="weight-start" locale={locale} />
            <p className="quick-hint quick-wide">{translate(locale, "dashboard.weightHelper")}</p>
        </div>
    );
}
