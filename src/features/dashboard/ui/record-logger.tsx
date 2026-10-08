"use client";

import { ArrowLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, type FormEvent, type ReactNode, useContext, useState } from "react";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import { localHour, localInputToUtc, localInputValue } from "@/core/time/zoned-time";
import { mealLabelForHour, mealLabels } from "@/features/insights/insights";
import { gramsToUnit, type Locale, type WeightUnit } from "@/features/logbook/domain";
import { DateTimeField } from "@/ui/date-time-field";
import { KindIcon, recordKinds, type RecordKind } from "@/ui/kind-icon";
import { Select } from "@/ui/select";
import { Sheet } from "@/ui/sheet";

const mealLabelKeys = {
    Breakfast: "entry.breakfast",
    Dinner: "entry.dinner",
    Lunch: "entry.lunch",
    "Snack 1": "entry.snack1",
    "Snack 2": "entry.snack2",
} as const;

const trainingSuggestions = ["walk", "run", "gym", "tennis", "tableTennis"] as const;
const OTHER_ACTIVITY = "__other__";

type Context = Readonly<{
    hasActiveActivity: boolean;
    lastWeightGrams: number | null;
    locale: Locale;
    recentTrainingLabels: readonly string[];
    timeZone: string;
    weightUnit: WeightUnit;
}>;

/** Opens the logger sheet, either on the type picker (null) or straight on a form. */
const OpenLogger = createContext<(kind: RecordKind | null) => void>(() => undefined);

const isActivityKind = (kind: RecordKind) => kind === "training" || kind === "sleep";

/** Owns the logger sheet; anything inside can open it with `useOpenLogger`. */
export function RecordLoggerProvider({ children, ...context }: Context & { children: ReactNode }) {
    const { hasActiveActivity, locale } = context;
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<RecordKind | null>(null);
    const [savedMessage, setSavedMessage] = useState("");
    const isBlocked = (value: RecordKind) => hasActiveActivity && isActivityKind(value);

    function openLogger(next: RecordKind | null) {
        // A running activity blocks starting another; show the picker and its hint instead.
        setKind(next && isBlocked(next) ? null : next);
        setSavedMessage("");
        setOpen(true);
    }

    function saved() {
        setOpen(false);
        setSavedMessage(translate(locale, "common.saved"));
        router.refresh();
    }

    return (
        <OpenLogger.Provider value={openLogger}>
            {children}
            <p aria-live="polite" className="sr-only">
                {savedMessage}
            </p>
            <Sheet
                closeLabel={translate(locale, "common.close")}
                onClose={() => setOpen(false)}
                open={open}
                title={translate(locale, kind ? `dashboard.${kind}` : "dashboard.addRecord")}
            >
                {kind ? (
                    <RecordForm
                        {...context}
                        kind={kind}
                        onBack={() => setKind(null)}
                        onSaved={saved}
                    />
                ) : (
                    <div className="kind-picker">
                        {recordKinds.map((value) => (
                            <button
                                className="kind-option tile"
                                data-kind={value}
                                disabled={isBlocked(value)}
                                key={value}
                                onClick={() => setKind(value)}
                                type="button"
                            >
                                <KindIcon kind={value} size="large" />
                                <strong>{translate(locale, `dashboard.${value}`)}</strong>
                            </button>
                        ))}
                        {hasActiveActivity && (
                            <p className="kind-picker-hint muted">
                                {translate(locale, "dashboard.activityBlocked")}
                            </p>
                        )}
                    </div>
                )}
            </Sheet>
        </OpenLogger.Provider>
    );
}

export function useOpenLogger() {
    return useContext(OpenLogger);
}

export function AddRecordButton({ label }: Readonly<{ label: string }>) {
    const openLogger = useOpenLogger();
    return (
        <button
            className="button button-primary add-record"
            onClick={() => openLogger(null)}
            type="button"
        >
            <Plus aria-hidden="true" size={20} strokeWidth={2.6} />
            {label}
        </button>
    );
}

/** A day tile that doubles as a shortcut to log that record type. */
export function LogTile({
    actionLabel,
    kind,
    label,
    value,
}: Readonly<{ actionLabel: string; kind: RecordKind; label: string; value: string }>) {
    const openLogger = useOpenLogger();
    return (
        <button
            aria-label={`${label}: ${value}. ${actionLabel}`}
            className="tile today-tile"
            data-kind={kind}
            onClick={() => openLogger(kind)}
            type="button"
        >
            <span className="today-tile-top">
                <KindIcon kind={kind} size="small" />
                <Plus aria-hidden="true" className="today-tile-plus" size={18} />
            </span>
            <span className="today-tile-label">{label}</span>
            <span className="today-tile-value numeric">{value}</span>
        </button>
    );
}

function RecordForm({
    kind,
    lastWeightGrams,
    locale,
    onBack,
    onSaved,
    recentTrainingLabels,
    timeZone,
    weightUnit,
}: Context & Readonly<{ kind: RecordKind; onBack: () => void; onSaved: () => void }>) {
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [hasEnd, setHasEnd] = useState(false);
    const [now] = useState(() => new Date());
    const isActivity = isActivityKind(kind);

    const activityOptions = [
        ...new Set([
            ...recentTrainingLabels,
            ...trainingSuggestions.map((key) => translate(locale, `entry.${key}`)),
        ]),
    ].map((label) => ({ label, value: label }));
    const [activity, setActivity] = useState(activityOptions[0]?.value ?? OTHER_ACTIVITY);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const field = (name: string) => String(form.get(name) ?? "");
        const startAt = localInputToUtc(field("startAt"), timeZone);
        setPending(true);
        const { ok } =
            kind === "weight"
                ? await sendJson("/api/weigh-ins", "POST", {
                      recordedAt: startAt,
                      unit: weightUnit,
                      weight: Number(field("weight")),
                  })
                : await sendJson("/api/entries", "POST", {
                      endAt: field("endAt") ? localInputToUtc(field("endAt"), timeZone) : null,
                      kind,
                      label: kind === "sleep" ? "Sleep" : field("label"),
                      startAt,
                      text: field("text"),
                  });
        setPending(false);
        setFailed(!ok);
        if (ok) onSaved();
    }

    return (
        <form className="record-form" data-kind={kind} onSubmit={save}>
            {kind === "meal" && (
                <>
                    <fieldset className="chip-row">
                        <legend className="field-label">
                            {translate(locale, "entry.mealType")}
                        </legend>
                        {mealLabels.map((label) => (
                            <label className="chip" key={label}>
                                <input
                                    defaultChecked={
                                        label === mealLabelForHour(localHour(now, timeZone))
                                    }
                                    name="label"
                                    type="radio"
                                    value={label}
                                />
                                {translate(locale, mealLabelKeys[label])}
                            </label>
                        ))}
                    </fieldset>
                    <div className="field">
                        <label htmlFor="record-text">{translate(locale, "common.details")}</label>
                        <input
                            autoFocus
                            className="input"
                            id="record-text"
                            maxLength={2000}
                            name="text"
                            placeholder={translate(locale, "dashboard.mealDetails")}
                            required
                        />
                    </div>
                </>
            )}
            {kind === "training" && (
                <div className="field">
                    <label htmlFor="record-activity">
                        {translate(locale, "entry.trainingType")}
                    </label>
                    <Select
                        id="record-activity"
                        onValueChange={setActivity}
                        options={[
                            ...activityOptions,
                            {
                                label: translate(locale, "entry.otherActivity"),
                                value: OTHER_ACTIVITY,
                            },
                        ]}
                        value={activity}
                    />
                    {activity === OTHER_ACTIVITY ? (
                        <input
                            aria-label={translate(locale, "entry.activityName")}
                            autoFocus
                            className="input"
                            maxLength={120}
                            name="label"
                            placeholder={translate(locale, "entry.activityName")}
                            required
                        />
                    ) : (
                        <input name="label" type="hidden" value={activity} />
                    )}
                </div>
            )}
            {kind === "weight" && (
                <div className="field">
                    <label htmlFor="record-weight">
                        {translate(locale, "entry.weightValue")} ({weightUnit})
                    </label>
                    <input
                        autoFocus
                        className="input weight-input"
                        defaultValue={
                            lastWeightGrams === null
                                ? ""
                                : Math.round(gramsToUnit(lastWeightGrams, weightUnit) * 10) / 10
                        }
                        id="record-weight"
                        inputMode="decimal"
                        max="1000"
                        min="1"
                        name="weight"
                        required
                        step="0.1"
                        type="number"
                    />
                </div>
            )}
            <div className="form-grid">
                <DateTimeField
                    defaultValue={localInputValue(now, timeZone)}
                    id="record-start"
                    label={translate(locale, isActivity ? "entry.startTime" : "entry.time")}
                    locale={locale}
                    name="startAt"
                    timeZone={timeZone}
                />
                {isActivity && (
                    <DateTimeField
                        clearable
                        id="record-end"
                        label={`${translate(locale, "entry.endTime")} · ${translate(locale, "common.optional")}`}
                        locale={locale}
                        name="endAt"
                        onChange={(value) => setHasEnd(value !== "")}
                        timeZone={timeZone}
                    />
                )}
            </div>
            {kind === "training" && (
                <div className="field">
                    <label htmlFor="record-text">
                        {translate(locale, "common.details")} ·{" "}
                        {translate(locale, "common.optional")}
                    </label>
                    <input className="input" id="record-text" maxLength={2000} name="text" />
                </div>
            )}
            <p aria-live="polite" className="status-message" data-tone="error">
                {failed ? translate(locale, "common.error") : ""}
            </p>
            <div className="form-actions">
                <button className="button button-ghost" onClick={onBack} type="button">
                    <ArrowLeft aria-hidden="true" size={18} />
                    {translate(locale, "common.back")}
                </button>
                <button className="button button-primary" disabled={pending} type="submit">
                    {translate(locale, isActivity && !hasEnd ? "common.start" : "common.add")}
                </button>
            </div>
        </form>
    );
}
