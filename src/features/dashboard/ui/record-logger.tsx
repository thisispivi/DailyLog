"use client";

import { ArrowLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import { localHour, localInputToUtc, localInputValue } from "@/core/time/zoned-time";
import { mealLabelForHour, mealLabels } from "@/features/insights/insights";
import { gramsToUnit, type Locale, type WeightUnit } from "@/features/logbook/domain";
import { KindIcon, recordKinds, type RecordKind } from "@/ui/kind-icon";
import { Sheet } from "@/ui/sheet";

const mealLabelKeys = {
    Breakfast: "entry.breakfast",
    Dinner: "entry.dinner",
    Lunch: "entry.lunch",
    "Snack 1": "entry.snack1",
    "Snack 2": "entry.snack2",
} as const;

const trainingSuggestions = ["walk", "run", "gym", "tennis", "tableTennis"] as const;

type Context = Readonly<{
    hasActiveActivity: boolean;
    lastTrainingLabel: string | null;
    lastWeightGrams: number | null;
    locale: Locale;
    timeZone: string;
    weightUnit: WeightUnit;
}>;

/** The "Add record" button and the sheet it opens: pick a type, then fill a short form. */
export function RecordLogger(context: Context) {
    const { hasActiveActivity, locale } = context;
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<RecordKind | null>(null);
    const [savedMessage, setSavedMessage] = useState("");
    const isBlocked = (value: RecordKind) =>
        hasActiveActivity && (value === "training" || value === "sleep");

    function saved() {
        setOpen(false);
        setSavedMessage(translate(locale, "common.saved"));
        router.refresh();
    }

    return (
        <>
            <button
                className="button button-primary add-record"
                onClick={() => {
                    setKind(null);
                    setSavedMessage("");
                    setOpen(true);
                }}
                type="button"
            >
                <Plus aria-hidden="true" size={20} strokeWidth={2.6} />
                {translate(locale, "dashboard.addRecord")}
            </button>
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
        </>
    );
}

function RecordForm({
    kind,
    lastTrainingLabel,
    lastWeightGrams,
    locale,
    onBack,
    onSaved,
    timeZone,
    weightUnit,
}: Context & Readonly<{ kind: RecordKind; onBack: () => void; onSaved: () => void }>) {
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [hasEnd, setHasEnd] = useState(false);
    const [now] = useState(() => new Date());
    const nowInput = localInputValue(now, timeZone);
    const isActivity = kind === "training" || kind === "sleep";

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

    const submitLabel = isActivity && !hasEnd ? "common.start" : "common.add";

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
                    <label htmlFor="record-label">{translate(locale, "entry.trainingType")}</label>
                    <input
                        className="input"
                        defaultValue={lastTrainingLabel ?? ""}
                        id="record-label"
                        list="training-suggestions"
                        maxLength={120}
                        name="label"
                        required
                    />
                    <datalist id="training-suggestions">
                        {trainingSuggestions.map((key) => (
                            <option key={key} value={translate(locale, `entry.${key}`)} />
                        ))}
                    </datalist>
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
                <div className="field">
                    <label htmlFor="record-start">
                        {translate(locale, isActivity ? "entry.startTime" : "entry.time")}
                    </label>
                    <input
                        className="input"
                        defaultValue={nowInput}
                        id="record-start"
                        name="startAt"
                        required
                        type="datetime-local"
                    />
                </div>
                {isActivity && (
                    <div className="field">
                        <label htmlFor="record-end">
                            {translate(locale, "entry.endTime")} ·{" "}
                            {translate(locale, "common.optional")}
                        </label>
                        <input
                            className="input"
                            id="record-end"
                            name="endAt"
                            onChange={(event) => setHasEnd(event.currentTarget.value !== "")}
                            type="datetime-local"
                        />
                    </div>
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
                    {translate(locale, submitLabel)}
                </button>
            </div>
        </form>
    );
}
