"use client";

import { Dumbbell, Moon, Scale, Utensils } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { translate } from "@/core/i18n/translate";
import { localDateTimeToUtc, localInputValue } from "@/core/time/zoned-time";
import type { EntryKind, Locale, WeightUnit } from "@/features/logbook/domain";

type LogMode = "meal" | "training" | "sleep" | "weight";

const modes = [
    { icon: Utensils, key: "dashboard.meal", value: "meal" },
    { icon: Dumbbell, key: "dashboard.training", value: "training" },
    { icon: Moon, key: "dashboard.sleep", value: "sleep" },
    { icon: Scale, key: "dashboard.weight", value: "weight" },
] as const;

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
    const [mode, setMode] = useState<LogMode>("meal");
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState("");
    const defaultTime = useMemo(() => localInputValue(new Date(), timeZone), [timeZone]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formElement = event.currentTarget;
        setPending(true);
        setMessage("");
        const form = new FormData(formElement);
        try {
            const start = String(form.get("startAt") ?? defaultTime);
            const end = String(form.get("endAt") ?? "");
            const startAt = fromLocalInput(start, timeZone);
            const endAt = end ? fromLocalInput(end, timeZone) : null;
            const response =
                mode === "weight"
                    ? await fetch("/api/weigh-ins", {
                          body: JSON.stringify({
                              recordedAt: startAt,
                              unit: weightUnit,
                              weight: Number(form.get("weight")),
                          }),
                          headers: { "content-type": "application/json" },
                          method: "POST",
                      })
                    : await fetch("/api/entries", {
                          body: JSON.stringify({
                              endAt: mode === "meal" ? null : endAt,
                              kind: mode satisfies EntryKind,
                              label: String(form.get("label") ?? defaultLabel(mode)),
                              startAt,
                              text: String(form.get("text") ?? ""),
                          }),
                          headers: { "content-type": "application/json" },
                          method: "POST",
                      });
            if (!response.ok) throw new Error("request failed");
            formElement.reset();
            setMessage(translate(locale, "common.saved"));
            router.refresh();
        } catch {
            setMessage(translate(locale, "common.error"));
        } finally {
            setPending(false);
        }
    }

    return (
        <section className="quick-log raised" aria-labelledby="quick-log-title">
            <div className="quick-log-heading">
                <div>
                    <p className="eyebrow">{translate(locale, "dashboard.quickAdd")}</p>
                    <h2 id="quick-log-title">{translate(locale, `dashboard.${mode}`)}</h2>
                </div>
                <div className="mode-switch" role="tablist">
                    {modes.map(({ icon: Icon, key, value }) => (
                        <button
                            aria-label={translate(locale, key)}
                            aria-selected={mode === value}
                            className="mode-button"
                            data-active={mode === value}
                            key={value}
                            onClick={() => setMode(value)}
                            role="tab"
                            type="button"
                        >
                            <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                        </button>
                    ))}
                </div>
            </div>
            <form onSubmit={submit}>
                {mode === "meal" && <MealFields defaultTime={defaultTime} locale={locale} />}
                {(mode === "training" || mode === "sleep") && (
                    <ActivityFields
                        defaultTime={defaultTime}
                        disabled={hasActiveActivity}
                        locale={locale}
                        mode={mode}
                    />
                )}
                {mode === "weight" && (
                    <WeightFields defaultTime={defaultTime} locale={locale} unit={weightUnit} />
                )}
                <div className="quick-submit-row">
                    <p aria-live="polite" className="quick-status">
                        {message}
                    </p>
                    <button
                        className="button button-accent"
                        disabled={
                            pending || (hasActiveActivity && mode !== "meal" && mode !== "weight")
                        }
                        type="submit"
                    >
                        {mode === "training" || mode === "sleep"
                            ? translate(locale, "common.start")
                            : translate(locale, "common.add")}
                    </button>
                </div>
            </form>
        </section>
    );
}

function MealFields({ defaultTime, locale }: Readonly<{ defaultTime: string; locale: Locale }>) {
    return (
        <div className="quick-fields">
            <div className="field">
                <label htmlFor="meal-label">{translate(locale, "entry.mealType")}</label>
                <select className="select" defaultValue="Lunch" id="meal-label" name="label">
                    <option value="Breakfast">{translate(locale, "entry.breakfast")}</option>
                    <option value="Snack 1">{translate(locale, "entry.snack1")}</option>
                    <option value="Lunch">{translate(locale, "entry.lunch")}</option>
                    <option value="Snack 2">{translate(locale, "entry.snack2")}</option>
                    <option value="Dinner">{translate(locale, "entry.dinner")}</option>
                </select>
            </div>
            <div className="field quick-detail-field">
                <label htmlFor="meal-text">{translate(locale, "common.details")}</label>
                <input className="input" id="meal-text" maxLength={2000} name="text" required />
            </div>
            <div className="field">
                <label htmlFor="meal-start">{translate(locale, "entry.startTime")}</label>
                <input
                    className="input"
                    defaultValue={defaultTime}
                    id="meal-start"
                    name="startAt"
                    required
                    type="datetime-local"
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
                <div className="field">
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
                        {(["walk", "run", "gym", "tennis", "tableTennis"] as const).map((key) => (
                            <option key={key} value={translate(locale, `entry.${key}`)} />
                        ))}
                    </datalist>
                </div>
            ) : (
                <input name="label" type="hidden" value="Sleep" />
            )}
            <div className="field">
                <label htmlFor="activity-start">{translate(locale, "entry.startTime")}</label>
                <input
                    className="input"
                    defaultValue={defaultTime}
                    disabled={disabled}
                    id="activity-start"
                    name="startAt"
                    required
                    type="datetime-local"
                />
            </div>
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
            <div className="field quick-detail-field">
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
                    max="1000"
                    min="0.01"
                    name="weight"
                    required
                    step="0.01"
                    type="number"
                />
            </div>
            <div className="field">
                <label htmlFor="weight-start">{translate(locale, "entry.startTime")}</label>
                <input
                    className="input"
                    defaultValue={defaultTime}
                    id="weight-start"
                    name="startAt"
                    required
                    type="datetime-local"
                />
            </div>
            <p className="weight-helper">{translate(locale, "dashboard.weightHelper")}</p>
        </div>
    );
}

function fromLocalInput(value: string, timeZone: string): string {
    const [date, time] = value.split("T") as [string, string];
    return localDateTimeToUtc(date, time, timeZone);
}

function defaultLabel(mode: LogMode): string {
    if (mode === "sleep") return "Sleep";
    if (mode === "training") return "Training";
    return "";
}
