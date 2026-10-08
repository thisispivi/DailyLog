"use client";

import { ChevronDown, RotateCcw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { sendJson } from "@/core/http/client";
import { formatDateTime, formatDuration, formatWeight, translate } from "@/core/i18n/translate";
import { localInputToUtc, localInputValue } from "@/core/time/zoned-time";
import {
    entryKinds,
    gramsToUnit,
    type Entry,
    type Locale,
    type TrashItem,
    type WeighIn,
    type WeightUnit,
} from "@/features/logbook/domain";
import { KindBadge } from "@/ui/kind-badge";
import { RobotMark } from "@/ui/robot-mark";

type HistoryRecord =
    { item: Entry; recordType: "entry" } | { item: WeighIn; recordType: "weighIn" };

const filters = [
    ["all", "history.all"],
    ["meal", "history.meal"],
    ["training", "history.training"],
    ["sleep", "history.sleep"],
    ["weighIn", "history.weighIns"],
    ["trash", "history.trash"],
] as const;

type Filter = (typeof filters)[number][0];

type Shared = Readonly<{ locale: Locale; timeZone: string; weightUnit: WeightUnit }>;

export function HistoryWorkspace({
    entries,
    locale,
    timeZone,
    trash,
    weighIns,
    weightUnit,
}: Shared &
    Readonly<{
        entries: Entry[];
        trash: TrashItem[];
        weighIns: WeighIn[];
    }>) {
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>("all");
    const [query, setQuery] = useState("");
    const [date, setDate] = useState("");
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const shared = { locale, timeZone, weightUnit };

    const records = useMemo(() => {
        if (filter === "trash") return [];
        const needle = query.trim().toLocaleLowerCase(locale);
        const onDate = (timestamp: string) =>
            !date || localInputValue(new Date(timestamp), timeZone).startsWith(date);
        const entryRecords: HistoryRecord[] = entries
            .filter((entry) => filter === "all" || filter === entry.kind)
            .filter(
                (entry) =>
                    !needle ||
                    `${entry.label} ${entry.text}`.toLocaleLowerCase(locale).includes(needle),
            )
            .filter((entry) => onDate(entry.startAt))
            .map((item) => ({ item, recordType: "entry" }));
        const weightRecords: HistoryRecord[] =
            (filter === "all" || filter === "weighIn") && !needle
                ? weighIns
                      .filter((item) => onDate(item.recordedAt))
                      .map((item) => ({ item, recordType: "weighIn" }))
                : [];
        return [...entryRecords, ...weightRecords].sort(
            (left, right) => Date.parse(recordDate(right)) - Date.parse(recordDate(left)),
        );
    }, [date, entries, filter, locale, query, timeZone, weighIns]);

    async function mutate(request: Promise<{ ok: boolean }>) {
        const { ok } = await request;
        setFailed(!ok);
        if (ok) router.refresh();
        return ok;
    }

    function deleteRecord(record: HistoryRecord) {
        const label =
            record.recordType === "entry"
                ? record.item.label
                : formatWeight(record.item.weightGrams, weightUnit, locale);
        if (!window.confirm(translate(locale, "history.confirmDelete", { label }))) return;
        const path = record.recordType === "entry" ? "entries" : "weigh-ins";
        void mutate(sendJson(`/api/${path}/${record.item.id}`, "DELETE"));
    }

    function deleteDay() {
        if (!window.confirm(translate(locale, "history.confirmBulk", { date }))) return;
        void mutate(sendJson("/api/entries/day", "DELETE", { date }));
    }

    function restore(item: TrashItem) {
        void mutate(
            sendJson("/api/trash", "POST", {
                recordId: item.recordId,
                recordType: item.recordType,
            }),
        );
    }

    return (
        <div className="history-workspace">
            <section
                aria-label={translate(locale, "history.filter")}
                className="history-filters card"
            >
                <div className="history-search">
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
                <label className="sr-only" htmlFor="history-date">
                    {translate(locale, "history.date")}
                </label>
                <input
                    className="input history-date"
                    id="history-date"
                    onChange={(event) => setDate(event.currentTarget.value)}
                    type="date"
                    value={date}
                />
                <div
                    aria-label={translate(locale, "history.filter")}
                    className="filter-chips"
                    role="group"
                >
                    {filters.map(([value, key]) => (
                        <button
                            aria-pressed={filter === value}
                            className="filter-chip"
                            data-kind={chipKind(value)}
                            key={value}
                            onClick={() => setFilter(value)}
                            type="button"
                        >
                            {translate(locale, key)}
                        </button>
                    ))}
                </div>
                {date && filter !== "trash" && (
                    <button
                        className="button button-danger history-bulk"
                        onClick={deleteDay}
                        type="button"
                    >
                        <Trash2 aria-hidden="true" size={16} />
                        {translate(locale, "history.bulkDelete")}
                    </button>
                )}
            </section>
            <p aria-live="polite" className="status-message" data-tone="error">
                {failed ? translate(locale, "common.error") : ""}
            </p>
            {filter === "trash" ? (
                <TrashList items={trash} onRestore={restore} {...shared} />
            ) : records.length === 0 ? (
                <div className="empty-state card">
                    <RobotMark size={56} />
                    <p>
                        {translate(
                            locale,
                            entries.length || weighIns.length
                                ? "common.noResults"
                                : "history.empty",
                        )}
                    </p>
                </div>
            ) : (
                <section className="record-list card">
                    <div className="card-heading">
                        <h2>{translate(locale, "history.title")}</h2>
                        <span className="count-pill">
                            {translate(locale, "history.results", { count: records.length })}
                        </span>
                    </div>
                    <ul>
                        {records.map((record) => {
                            const key = `${record.recordType}-${record.item.id}`;
                            const open = openKey === key;
                            return (
                                <li className="record-row" data-open={open} key={key}>
                                    <button
                                        aria-expanded={open}
                                        className="record-summary"
                                        onClick={() => setOpenKey(open ? null : key)}
                                        type="button"
                                    >
                                        <KindBadge
                                            kind={
                                                record.recordType === "entry"
                                                    ? record.item.kind
                                                    : "weight"
                                            }
                                        />
                                        <span className="record-text">
                                            <strong>
                                                {recordTitle(record, locale, weightUnit)}
                                            </strong>
                                            <span>{recordDetail(record, locale)}</span>
                                        </span>
                                        <time dateTime={recordDate(record)}>
                                            {formatDateTime(recordDate(record), locale, timeZone)}
                                        </time>
                                        <ChevronDown
                                            aria-hidden="true"
                                            className="record-chevron"
                                            size={18}
                                        />
                                    </button>
                                    {open && (
                                        <RecordEditor
                                            onClose={() => setOpenKey(null)}
                                            onDelete={() => deleteRecord(record)}
                                            record={record}
                                            {...shared}
                                        />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
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
    weightUnit,
}: Shared &
    Readonly<{
        onClose: () => void;
        onDelete: () => void;
        record: HistoryRecord;
    }>) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const id = record.item.id;

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const field = (name: string) => String(form.get(name) ?? "");
        const startAt = localInputToUtc(field("startAt"), timeZone);
        setPending(true);
        const { ok } =
            record.recordType === "entry"
                ? await sendJson(`/api/entries/${id}`, "PATCH", {
                      endAt: field("endAt") ? localInputToUtc(field("endAt"), timeZone) : null,
                      kind: field("kind"),
                      label: field("label"),
                      startAt,
                      text: field("text"),
                  })
                : await sendJson(`/api/weigh-ins/${id}`, "PATCH", {
                      recordedAt: startAt,
                      unit: weightUnit,
                      weight: Number(field("weight")),
                  });
        setPending(false);
        setFailed(!ok);
        if (!ok) return;
        onClose();
        router.refresh();
    }

    return (
        <form className="record-editor" onSubmit={save}>
            {record.recordType === "entry" ? (
                <>
                    <div className="field">
                        <label htmlFor={`kind-${id}`}>{translate(locale, "history.type")}</label>
                        <select
                            className="select"
                            defaultValue={record.item.kind}
                            id={`kind-${id}`}
                            name="kind"
                        >
                            {entryKinds.map((kind) => (
                                <option key={kind} value={kind}>
                                    {translate(locale, `dashboard.${kind}`)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="field">
                        <label htmlFor={`label-${id}`}>{translate(locale, "common.label")}</label>
                        <input
                            className="input"
                            defaultValue={record.item.label}
                            id={`label-${id}`}
                            maxLength={120}
                            name="label"
                            required
                        />
                    </div>
                    <DateTimeField
                        id={`start-${id}`}
                        label={translate(locale, "entry.startTime")}
                        name="startAt"
                        required
                        timeZone={timeZone}
                        value={record.item.startAt}
                    />
                    <DateTimeField
                        id={`end-${id}`}
                        label={translate(locale, "entry.endTime")}
                        name="endAt"
                        timeZone={timeZone}
                        value={record.item.endAt}
                    />
                    <div className="field editor-wide">
                        <label htmlFor={`text-${id}`}>{translate(locale, "common.details")}</label>
                        <textarea
                            className="textarea"
                            defaultValue={record.item.text}
                            id={`text-${id}`}
                            maxLength={2000}
                            name="text"
                        />
                    </div>
                </>
            ) : (
                <>
                    <div className="field">
                        <label htmlFor={`weight-${id}`}>
                            {translate(locale, "entry.weightValue")} ({weightUnit})
                        </label>
                        <input
                            className="input"
                            defaultValue={
                                Math.round(gramsToUnit(record.item.weightGrams, weightUnit) * 100) /
                                100
                            }
                            id={`weight-${id}`}
                            inputMode="decimal"
                            max="1000"
                            min="1"
                            name="weight"
                            required
                            step="0.01"
                            type="number"
                        />
                    </div>
                    <DateTimeField
                        id={`start-${id}`}
                        label={translate(locale, "entry.startTime")}
                        name="startAt"
                        required
                        timeZone={timeZone}
                        value={record.item.recordedAt}
                    />
                </>
            )}
            <p aria-live="polite" className="status-message editor-wide" data-tone="error">
                {failed ? translate(locale, "common.validation") : ""}
            </p>
            <div className="editor-actions editor-wide">
                <button className="button button-danger" onClick={onDelete} type="button">
                    <Trash2 aria-hidden="true" size={16} />
                    {translate(locale, "common.delete")}
                </button>
                <button className="button button-ghost" onClick={onClose} type="button">
                    {translate(locale, "common.cancel")}
                </button>
                <button className="button button-primary" disabled={pending} type="submit">
                    {translate(locale, "common.save")}
                </button>
            </div>
        </form>
    );
}

function DateTimeField({
    id,
    label,
    name,
    required = false,
    timeZone,
    value,
}: Readonly<{
    id: string;
    label: string;
    name: string;
    required?: boolean;
    timeZone: string;
    value: string | null;
}>) {
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <input
                className="input"
                defaultValue={value ? localInputValue(new Date(value), timeZone) : ""}
                id={id}
                name={name}
                required={required}
                type="datetime-local"
            />
        </div>
    );
}

function TrashList({
    items,
    locale,
    onRestore,
    timeZone,
    weightUnit,
}: Shared & Readonly<{ items: TrashItem[]; onRestore: (item: TrashItem) => void }>) {
    return (
        <section className="record-list card">
            <div className="card-heading">
                <div>
                    <h2>{translate(locale, "history.trash")}</h2>
                    <p className="muted trash-hint">{translate(locale, "history.trashHint")}</p>
                </div>
            </div>
            {items.length === 0 ? (
                <div className="empty-state">
                    <RobotMark size={56} />
                    <p>{translate(locale, "history.trashEmpty")}</p>
                </div>
            ) : (
                <ul>
                    {items.map((item) => (
                        <li className="trash-row" key={`${item.recordType}-${item.recordId}`}>
                            <span className="record-text">
                                <strong>
                                    {item.recordType === "entry"
                                        ? item.label
                                        : formatWeight(item.weightGrams, weightUnit, locale)}
                                </strong>
                                <span>{formatDateTime(item.deletedAt, locale, timeZone)}</span>
                            </span>
                            <button
                                className="button button-ghost"
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

function chipKind(filter: Filter): string | undefined {
    if (filter === "weighIn") return "weight";
    return (entryKinds as readonly string[]).includes(filter) ? filter : undefined;
}

function recordDate(record: HistoryRecord): string {
    return record.recordType === "entry" ? record.item.startAt : record.item.recordedAt;
}

function recordTitle(record: HistoryRecord, locale: Locale, unit: WeightUnit): string {
    return record.recordType === "entry"
        ? record.item.label
        : formatWeight(record.item.weightGrams, unit, locale);
}

function recordDetail(record: HistoryRecord, locale: Locale): string {
    if (record.recordType === "weighIn") return translate(locale, "dashboard.weight");
    return record.item.text || formatDuration(record.item.startAt, record.item.endAt, locale);
}
