"use client";

import { ChevronDown, RotateCcw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { formatDateTime, formatDuration, formatWeight, translate } from "@/core/i18n/translate";
import { localDateTimeToUtc, localInputValue } from "@/core/time/zoned-time";
import type {
    Entry,
    EntryKind,
    Locale,
    TrashItem,
    WeighIn,
    WeightUnit,
} from "@/features/logbook/domain";

type CurrentRecord =
    { item: Entry; recordType: "entry" } | { item: WeighIn; recordType: "weighIn" };

export function HistoryWorkspace({
    entries,
    locale,
    timeZone,
    trash,
    weighIns,
    weightUnit,
}: Readonly<{
    entries: Entry[];
    locale: Locale;
    timeZone: string;
    trash: TrashItem[];
    weighIns: WeighIn[];
    weightUnit: WeightUnit;
}>) {
    const router = useRouter();
    const [type, setType] = useState<"all" | EntryKind | "weighIn" | "trash">("all");
    const [query, setQuery] = useState("");
    const [date, setDate] = useState("");
    const [editing, setEditing] = useState<CurrentRecord | null>(null);
    const [message, setMessage] = useState("");

    const records = useMemo(() => {
        if (type === "trash") return [];
        const normalizedQuery = query.trim().toLocaleLowerCase(locale);
        const entryRecords: CurrentRecord[] = entries
            .filter((entry) => type === "all" || type === entry.kind)
            .filter(
                (entry) =>
                    !normalizedQuery ||
                    `${entry.label} ${entry.text}`
                        .toLocaleLowerCase(locale)
                        .includes(normalizedQuery),
            )
            .filter(
                (entry) =>
                    !date || localInputValue(new Date(entry.startAt), timeZone).startsWith(date),
            )
            .map((item) => ({ item, recordType: "entry" }));
        const weightRecords: CurrentRecord[] = weighIns
            .filter(() => type === "all" || type === "weighIn")
            .filter(
                (item) =>
                    !date || localInputValue(new Date(item.recordedAt), timeZone).startsWith(date),
            )
            .map((item) => ({ item, recordType: "weighIn" }));
        return [...entryRecords, ...weightRecords].sort(
            (left, right) => Date.parse(recordDate(right)) - Date.parse(recordDate(left)),
        );
    }, [date, entries, locale, query, timeZone, type, weighIns]);

    async function deleteRecord(record: CurrentRecord) {
        const label =
            record.recordType === "entry"
                ? record.item.label
                : formatWeight(record.item.weightGrams, weightUnit, locale);
        if (!window.confirm(translate(locale, "history.confirmDelete", { label }))) return;
        const path =
            record.recordType === "entry"
                ? `/api/entries/${record.item.id}`
                : `/api/weigh-ins/${record.item.id}`;
        const response = await fetch(path, { method: "DELETE" });
        setMessage(
            response.ok ? translate(locale, "common.saved") : translate(locale, "common.error"),
        );
        if (response.ok) router.refresh();
    }

    async function deleteDay() {
        if (!date || !window.confirm(translate(locale, "history.confirmBulk", { date }))) return;
        const response = await fetch("/api/entries/day", {
            body: JSON.stringify({ date }),
            headers: { "content-type": "application/json" },
            method: "DELETE",
        });
        setMessage(
            response.ok ? translate(locale, "common.saved") : translate(locale, "common.error"),
        );
        if (response.ok) router.refresh();
    }

    async function restore(item: TrashItem) {
        const response = await fetch("/api/trash", {
            body: JSON.stringify({ recordId: item.recordId, recordType: item.recordType }),
            headers: { "content-type": "application/json" },
            method: "POST",
        });
        setMessage(
            response.ok ? translate(locale, "common.saved") : translate(locale, "common.error"),
        );
        if (response.ok) router.refresh();
    }

    return (
        <div className="history-workspace">
            <section
                className="history-filters surface"
                aria-label={translate(locale, "history.filter")}
            >
                <div className="search-field">
                    <Search aria-hidden="true" size={18} />
                    <label className="sr-only" htmlFor="history-search">
                        {translate(locale, "common.search")}
                    </label>
                    <input
                        className="input"
                        id="history-search"
                        onChange={(event) => setQuery(event.currentTarget.value)}
                        placeholder={translate(locale, "history.searchPlaceholder")}
                        type="search"
                        value={query}
                    />
                </div>
                <label className="sr-only" htmlFor="history-type">
                    {translate(locale, "history.filter")}
                </label>
                <select
                    className="select"
                    id="history-type"
                    onChange={(event) => setType(event.currentTarget.value as typeof type)}
                    value={type}
                >
                    <option value="all">{translate(locale, "history.all")}</option>
                    <option value="meal">{translate(locale, "history.meal")}</option>
                    <option value="training">{translate(locale, "history.training")}</option>
                    <option value="sleep">{translate(locale, "history.sleep")}</option>
                    <option value="weighIn">{translate(locale, "history.weighIns")}</option>
                    <option value="trash">{translate(locale, "history.trash")}</option>
                </select>
                <label className="sr-only" htmlFor="history-date">
                    {translate(locale, "history.date")}
                </label>
                <input
                    className="input"
                    id="history-date"
                    onChange={(event) => setDate(event.currentTarget.value)}
                    type="date"
                    value={date}
                />
                {date && type !== "trash" && (
                    <button className="button button-danger" onClick={deleteDay} type="button">
                        <Trash2 aria-hidden="true" size={17} />
                        {translate(locale, "history.bulkDelete")}
                    </button>
                )}
            </section>
            <p aria-live="polite" className="history-status">
                {message}
            </p>
            {type === "trash" ? (
                <TrashList items={trash} locale={locale} onRestore={restore} timeZone={timeZone} />
            ) : records.length === 0 ? (
                <div className="empty-state surface">
                    {entries.length || weighIns.length
                        ? translate(locale, "common.noResults")
                        : translate(locale, "history.empty")}
                </div>
            ) : (
                <section
                    className="record-list surface"
                    aria-label={translate(locale, "history.results", { count: records.length })}
                >
                    <div className="record-list-header">
                        <strong>
                            {translate(locale, "history.results", { count: records.length })}
                        </strong>
                    </div>
                    {records.map((record) => (
                        <article
                            className="record-row"
                            key={`${record.recordType}-${record.item.id}`}
                        >
                            <button
                                className="record-main"
                                onClick={() =>
                                    setEditing(
                                        editing?.item.id === record.item.id &&
                                            editing.recordType === record.recordType
                                            ? null
                                            : record,
                                    )
                                }
                                type="button"
                            >
                                <span className="record-kind">
                                    {record.recordType === "entry"
                                        ? translate(locale, `dashboard.${record.item.kind}`)
                                        : translate(locale, "dashboard.weight")}
                                </span>
                                <strong>{recordTitle(record, locale, weightUnit)}</strong>
                                <span>{recordDetail(record, locale)}</span>
                                <time>{formatDateTime(recordDate(record), locale, timeZone)}</time>
                                <ChevronDown
                                    aria-hidden="true"
                                    className="record-chevron"
                                    data-open={
                                        editing?.item.id === record.item.id &&
                                        editing.recordType === record.recordType
                                    }
                                    size={18}
                                />
                            </button>
                            {editing?.item.id === record.item.id &&
                                editing.recordType === record.recordType && (
                                    <RecordEditor
                                        locale={locale}
                                        onClose={() => setEditing(null)}
                                        onDelete={() => deleteRecord(record)}
                                        record={record}
                                        timeZone={timeZone}
                                        unit={weightUnit}
                                    />
                                )}
                        </article>
                    ))}
                </section>
            )}
        </div>
    );
}

function RecordEditor({
    locale,
    onClose,
    onDelete,
    record,
    timeZone,
    unit,
}: Readonly<{
    locale: Locale;
    onClose: () => void;
    onDelete: () => void;
    record: CurrentRecord;
    timeZone: string;
    unit: WeightUnit;
}>) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const response =
            record.recordType === "entry"
                ? await fetch(`/api/entries/${record.item.id}`, {
                      body: JSON.stringify({
                          endAt: form.get("endAt")
                              ? fromLocal(String(form.get("endAt")), timeZone)
                              : null,
                          kind: form.get("kind"),
                          label: form.get("label"),
                          startAt: fromLocal(String(form.get("startAt")), timeZone),
                          text: form.get("text"),
                      }),
                      headers: { "content-type": "application/json" },
                      method: "PATCH",
                  })
                : await fetch(`/api/weigh-ins/${record.item.id}`, {
                      body: JSON.stringify({
                          recordedAt: fromLocal(String(form.get("startAt")), timeZone),
                          unit,
                          weight: Number(form.get("weight")),
                      }),
                      headers: { "content-type": "application/json" },
                      method: "PATCH",
                  });
        setPending(false);
        if (!response.ok) {
            setError(translate(locale, "common.validation"));
            return;
        }
        onClose();
        router.refresh();
    }

    return (
        <form className="record-editor" onSubmit={submit}>
            {record.recordType === "entry" ? (
                <>
                    <div className="field">
                        <label htmlFor={`kind-${record.item.id}`}>
                            {translate(locale, "history.filter")}
                        </label>
                        <select
                            className="select"
                            defaultValue={record.item.kind}
                            id={`kind-${record.item.id}`}
                            name="kind"
                        >
                            <option value="meal">{translate(locale, "dashboard.meal")}</option>
                            <option value="training">
                                {translate(locale, "dashboard.training")}
                            </option>
                            <option value="sleep">{translate(locale, "dashboard.sleep")}</option>
                        </select>
                    </div>
                    <div className="field">
                        <label htmlFor={`label-${record.item.id}`}>
                            {translate(locale, "common.label")}
                        </label>
                        <input
                            className="input"
                            defaultValue={record.item.label}
                            id={`label-${record.item.id}`}
                            maxLength={120}
                            name="label"
                            required
                        />
                    </div>
                    <div className="field editor-wide">
                        <label htmlFor={`text-${record.item.id}`}>
                            {translate(locale, "common.details")}
                        </label>
                        <textarea
                            className="textarea"
                            defaultValue={record.item.text}
                            id={`text-${record.item.id}`}
                            maxLength={2000}
                            name="text"
                        />
                    </div>
                    <DateFields
                        endAt={record.item.endAt}
                        id={record.item.id}
                        locale={locale}
                        startAt={record.item.startAt}
                        timeZone={timeZone}
                    />
                </>
            ) : (
                <>
                    <div className="field">
                        <label htmlFor={`weight-${record.item.id}`}>
                            {translate(locale, "entry.weightValue")} ({unit})
                        </label>
                        <input
                            className="input"
                            defaultValue={weightNumber(record.item.weightGrams, unit)}
                            id={`weight-${record.item.id}`}
                            min="0.01"
                            name="weight"
                            required
                            step="0.01"
                            type="number"
                        />
                    </div>
                    <DateFields
                        id={record.item.id}
                        locale={locale}
                        startAt={record.item.recordedAt}
                        timeZone={timeZone}
                    />
                </>
            )}
            <p aria-live="polite" className="status-message editor-wide">
                {error}
            </p>
            <div className="editor-actions editor-wide">
                <button className="button button-danger" onClick={onDelete} type="button">
                    {translate(locale, "common.delete")}
                </button>
                <span />
                <button className="button button-quiet" onClick={onClose} type="button">
                    {translate(locale, "common.cancel")}
                </button>
                <button className="button button-primary" disabled={pending} type="submit">
                    {translate(locale, "common.save")}
                </button>
            </div>
        </form>
    );
}

function DateFields({
    endAt,
    id,
    locale,
    startAt,
    timeZone,
}: Readonly<{
    endAt?: string | null;
    id: number;
    locale: Locale;
    startAt: string;
    timeZone: string;
}>) {
    return (
        <>
            <div className="field">
                <label htmlFor={`start-${id}`}>{translate(locale, "entry.startTime")}</label>
                <input
                    className="input"
                    defaultValue={localInputValue(new Date(startAt), timeZone)}
                    id={`start-${id}`}
                    name="startAt"
                    required
                    type="datetime-local"
                />
            </div>
            {endAt !== undefined && (
                <div className="field">
                    <label htmlFor={`end-${id}`}>{translate(locale, "entry.endTime")}</label>
                    <input
                        className="input"
                        defaultValue={endAt ? localInputValue(new Date(endAt), timeZone) : ""}
                        id={`end-${id}`}
                        name="endAt"
                        type="datetime-local"
                    />
                </div>
            )}
        </>
    );
}

function TrashList({
    items,
    locale,
    onRestore,
    timeZone,
}: Readonly<{
    items: TrashItem[];
    locale: Locale;
    onRestore: (item: TrashItem) => void;
    timeZone: string;
}>) {
    return (
        <section className="trash-panel surface">
            <div className="trash-heading">
                <div>
                    <h2>{translate(locale, "history.trash")}</h2>
                    <p>{translate(locale, "history.trashHint")}</p>
                </div>
            </div>
            {items.length === 0 ? (
                <div className="empty-state">{translate(locale, "history.trashEmpty")}</div>
            ) : (
                <ul className="trash-list">
                    {items.map((item) => (
                        <li key={`${item.recordType}-${item.recordId}`}>
                            <div>
                                <strong>{item.label}</strong>
                                <span>{formatDateTime(item.deletedAt, locale, timeZone)}</span>
                            </div>
                            <button
                                className="button"
                                onClick={() => onRestore(item)}
                                type="button"
                            >
                                <RotateCcw aria-hidden="true" size={16} />
                                {translate(locale, "common.restore")}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function recordDate(record: CurrentRecord): string {
    return record.recordType === "entry" ? record.item.startAt : record.item.recordedAt;
}
function recordTitle(record: CurrentRecord, locale: Locale, unit: WeightUnit): string {
    return record.recordType === "entry"
        ? record.item.label
        : formatWeight(record.item.weightGrams, unit, locale);
}
function recordDetail(record: CurrentRecord, locale: Locale): string {
    return record.recordType === "entry"
        ? record.item.text || formatDuration(record.item.startAt, record.item.endAt, locale)
        : "";
}
function fromLocal(value: string, timeZone: string): string {
    const [date, time] = value.split("T") as [string, string];
    return localDateTimeToUtc(date, time, timeZone);
}
function weightNumber(grams: number, unit: WeightUnit): number {
    return Math.round((unit === "kg" ? grams / 1000 : grams / 1000 / 0.45359237) * 100) / 100;
}
