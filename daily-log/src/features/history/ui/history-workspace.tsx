"use client";

import { ChevronRight, Inbox, RotateCcw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { sendJson } from "@/core/http/client";
import {
    formatDate,
    formatDateTime,
    formatDuration,
    formatWeight,
    translate,
} from "@/core/i18n/translate";
import { localInputToUtc, localInputValue } from "@/core/time/zoned-time";
import { entryDisplayLabel, loneSnackIds } from "@/features/logbook/entry-label";
import {
    entryKinds,
    gramsToUnit,
    type Entry,
    type Locale,
    type TimeFormat,
    type TrashItem,
    type WeighIn,
    type WeightUnit,
} from "@/features/logbook/domain";
import { DateTimeField } from "@/ui/date-time-field";
import { KindIcon } from "@/ui/kind-icon";
import { Select } from "@/ui/select";
import { Sheet } from "@/ui/sheet";
import { showToast } from "@/ui/toast";

type HistoryRecord =
    { item: Entry; recordType: "entry" } | { item: WeighIn; recordType: "weighIn" };

const filters = [
    { key: "history.all", kind: undefined, value: "all" },
    { key: "history.meal", kind: "meal", value: "meal" },
    { key: "history.training", kind: "training", value: "training" },
    { key: "history.sleep", kind: "sleep", value: "sleep" },
    { key: "history.weighIns", kind: "weight", value: "weighIn" },
    { key: "history.trash", kind: undefined, value: "trash" },
] as const;

type Filter = (typeof filters)[number]["value"];

type EditorMessage = "toast.changesSaved" | "toast.movedToTrash";

const trashKey = (item: TrashItem) => `${item.recordType}-${item.recordId}`;

type Shared = Readonly<{
    locale: Locale;
    timeFormat: TimeFormat;
    timeZone: string;
    weightUnit: WeightUnit;
}>;

export function HistoryWorkspace({
    entries,
    locale,
    timeFormat,
    timeZone,
    trash,
    weighIns,
    weightUnit,
}: Shared & Readonly<{ entries: Entry[]; trash: TrashItem[]; weighIns: WeighIn[] }>) {
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>("all");
    const [query, setQuery] = useState("");
    const [date, setDate] = useState("");
    // The record stays set while the sheet closes, so its exit shows the editor, not an empty sheet.
    const [editing, setEditing] = useState<HistoryRecord | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const shared = { locale, timeFormat, timeZone, weightUnit };

    const loneSnacks = useMemo(() => loneSnackIds(entries, timeZone), [entries, timeZone]);
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
                    `${entryDisplayLabel(entry, locale)} ${entry.label} ${entry.text}`
                        .toLocaleLowerCase(locale)
                        .includes(needle),
            )
            .filter((entry) => onDate(entry.startAt))
            .map((item) => ({ item, recordType: "entry" }));
        // Weigh-ins have no text, so a search never matches them.
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

    async function mutate(
        key: string,
        request: Promise<{ ok: boolean }>,
        message: "toast.dayMovedToTrash" | "toast.restored",
    ) {
        setBusy(key);
        const { ok } = await request;
        setBusy(null);
        setFailed(!ok);
        if (!ok) return;
        showToast(translate(locale, message));
        router.refresh();
    }

    function deleteDay() {
        const day = formatDate(`${date}T12:00:00Z`, locale, "UTC");
        if (!window.confirm(translate(locale, "history.confirmBulk", { date: day }))) return;
        void mutate(
            "day",
            sendJson("/api/entries/day", "DELETE", { date }),
            "toast.dayMovedToTrash",
        );
    }

    function restore(item: TrashItem) {
        void mutate(
            trashKey(item),
            sendJson("/api/trash", "POST", {
                recordId: item.recordId,
                recordType: item.recordType,
            }),
            "toast.restored",
        );
    }

    return (
        <div className="history-workspace">
            <section aria-label={translate(locale, "history.filter")} className="history-filters">
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
                <DateTimeField
                    clearable
                    id="history-date"
                    label={translate(locale, "history.date")}
                    labelHidden
                    locale={locale}
                    mode="date"
                    onChange={setDate}
                    timeZone={timeZone}
                    value={date}
                />
                <div
                    aria-label={translate(locale, "history.filter")}
                    className="history-chips"
                    role="group"
                >
                    {filters.map(({ key, kind, value }) => (
                        <button
                            aria-pressed={filter === value}
                            className="chip"
                            data-kind={kind}
                            key={value}
                            onClick={() => setFilter(value)}
                            type="button"
                        >
                            {translate(locale, key)}
                        </button>
                    ))}
                </div>
            </section>
            {date && filter !== "trash" && (
                <button
                    aria-busy={busy === "day"}
                    className="button button-danger history-bulk"
                    disabled={busy !== null}
                    onClick={deleteDay}
                    type="button"
                >
                    <Trash2 aria-hidden="true" size={16} />
                    {translate(locale, "history.bulkDelete")}
                </button>
            )}
            <p aria-live="polite" className="status-message" data-tone="error">
                {failed ? translate(locale, "common.error") : ""}
            </p>
            {filter === "trash" ? (
                <TrashList busy={busy} items={trash} onRestore={restore} {...shared} />
            ) : (
                <section className="card">
                    <div className="card-heading">
                        <h2>{translate(locale, "history.title")}</h2>
                        <span className="pill numeric">
                            {translate(locale, "history.results", { count: records.length })}
                        </span>
                    </div>
                    {records.length === 0 ? (
                        <EmptyState
                            message={translate(
                                locale,
                                entries.length || weighIns.length
                                    ? "common.noResults"
                                    : "history.empty",
                            )}
                        />
                    ) : (
                        <ul className="record-list">
                            {records.map((record) => (
                                <li key={`${record.recordType}-${record.item.id}`}>
                                    <button
                                        className="record-row"
                                        onClick={() => {
                                            setEditing(record);
                                            setIsEditorOpen(true);
                                        }}
                                        type="button"
                                    >
                                        <KindIcon
                                            kind={
                                                record.recordType === "entry"
                                                    ? record.item.kind
                                                    : "weight"
                                            }
                                        />
                                        <span className="record-text">
                                            <strong>
                                                {recordTitle(
                                                    record,
                                                    locale,
                                                    weightUnit,
                                                    loneSnacks,
                                                )}
                                            </strong>
                                            <span>{recordDetail(record, locale)}</span>
                                        </span>
                                        <time className="numeric" dateTime={recordDate(record)}>
                                            {formatDateTime(
                                                recordDate(record),
                                                locale,
                                                timeZone,
                                                timeFormat,
                                            )}
                                        </time>
                                        <ChevronRight
                                            aria-hidden="true"
                                            className="record-chevron"
                                            size={18}
                                        />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
            <Sheet
                closeLabel={translate(locale, "common.close")}
                onClose={() => setIsEditorOpen(false)}
                open={isEditorOpen}
                title={translate(locale, "common.edit")}
            >
                {editing && (
                    <RecordEditor
                        onDone={(message) => {
                            setIsEditorOpen(false);
                            showToast(translate(locale, message));
                            router.refresh();
                        }}
                        record={editing}
                        {...shared}
                    />
                )}
            </Sheet>
        </div>
    );
}

function RecordEditor({
    locale,
    onDone,
    record,
    timeFormat,
    timeZone,
    weightUnit,
}: Shared & Readonly<{ onDone: (message: EditorMessage) => void; record: HistoryRecord }>) {
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    // Only entries have a range; the end picker opens on the start day.
    const [start, setStart] = useState(() =>
        record.recordType === "entry"
            ? localInputValue(new Date(record.item.startAt), timeZone)
            : "",
    );
    const id = record.item.id;
    // Stored bot labels are shown translated; keep the stored value unless it was edited.
    const shownLabel = record.recordType === "entry" ? entryDisplayLabel(record.item, locale) : "";
    const path = record.recordType === "entry" ? `/api/entries/${id}` : `/api/weigh-ins/${id}`;

    async function settle(request: Promise<{ ok: boolean }>, message: EditorMessage) {
        setPending(true);
        const { ok } = await request;
        setPending(false);
        setFailed(!ok);
        if (ok) onDone(message);
    }

    function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const field = (name: string) => String(form.get(name) ?? "");
        const startAt = localInputToUtc(field("startAt"), timeZone);
        void settle(
            record.recordType === "entry"
                ? sendJson(path, "PATCH", {
                      endAt: field("endAt") ? localInputToUtc(field("endAt"), timeZone) : null,
                      kind: field("kind"),
                      label:
                          record.recordType === "entry" && field("label") === shownLabel
                              ? record.item.label
                              : field("label"),
                      startAt,
                      text: field("text"),
                  })
                : sendJson(path, "PATCH", {
                      recordedAt: startAt,
                      unit: weightUnit,
                      weight: Number(field("weight")),
                  }),
            "toast.changesSaved",
        );
    }

    function moveToTrash() {
        const label =
            record.recordType === "entry"
                ? shownLabel
                : formatWeight(record.item.weightGrams, weightUnit, locale);
        if (!window.confirm(translate(locale, "history.confirmDelete", { label }))) return;
        void settle(sendJson(path, "DELETE"), "toast.movedToTrash");
    }

    return (
        <form className="form-grid" onSubmit={save}>
            {record.recordType === "entry" ? (
                <>
                    <div className="field">
                        <label htmlFor="edit-kind">{translate(locale, "history.type")}</label>
                        <Select
                            defaultValue={record.item.kind}
                            id="edit-kind"
                            name="kind"
                            options={entryKinds.map((kind) => ({
                                icon: <KindIcon kind={kind} size="small" />,
                                label: translate(locale, `dashboard.${kind}`),
                                value: kind,
                            }))}
                        />
                    </div>
                    <div className="field">
                        <label htmlFor="edit-label">{translate(locale, "common.label")}</label>
                        <input
                            className="input"
                            defaultValue={shownLabel}
                            id="edit-label"
                            maxLength={120}
                            name="label"
                            required
                        />
                    </div>
                    <DateTimeField
                        id="edit-start"
                        label={translate(locale, "entry.startTime")}
                        locale={locale}
                        name="startAt"
                        onChange={setStart}
                        timeFormat={timeFormat}
                        timeZone={timeZone}
                        value={start}
                    />
                    <DateTimeField
                        clearable
                        fallbackDate={start.slice(0, 10)}
                        defaultValue={
                            record.item.endAt
                                ? localInputValue(new Date(record.item.endAt), timeZone)
                                : ""
                        }
                        id="edit-end"
                        label={translate(locale, "entry.endTime")}
                        locale={locale}
                        name="endAt"
                        timeFormat={timeFormat}
                        timeZone={timeZone}
                    />
                    <div className="field form-wide">
                        <label htmlFor="edit-text">{translate(locale, "common.details")}</label>
                        <textarea
                            className="textarea"
                            defaultValue={record.item.text}
                            id="edit-text"
                            maxLength={2000}
                            name="text"
                        />
                    </div>
                </>
            ) : (
                <>
                    <div className="field">
                        <label htmlFor="edit-weight">
                            {translate(locale, "entry.weightValue")} ({weightUnit})
                        </label>
                        <input
                            className="input"
                            defaultValue={
                                Math.round(gramsToUnit(record.item.weightGrams, weightUnit) * 100) /
                                100
                            }
                            id="edit-weight"
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
                        defaultValue={localInputValue(new Date(record.item.recordedAt), timeZone)}
                        id="edit-start"
                        label={translate(locale, "entry.time")}
                        locale={locale}
                        name="startAt"
                        timeFormat={timeFormat}
                        timeZone={timeZone}
                    />
                </>
            )}
            <p aria-live="polite" className="status-message form-wide" data-tone="error">
                {failed ? translate(locale, "common.validation") : ""}
            </p>
            <div className="form-actions form-wide editor-actions">
                <button
                    className="button button-danger"
                    aria-busy={pending}
                    disabled={pending}
                    onClick={moveToTrash}
                    type="button"
                >
                    <Trash2 aria-hidden="true" size={16} />
                    {translate(locale, "common.delete")}
                </button>
                <button
                    className="button button-primary"
                    aria-busy={pending}
                    disabled={pending}
                    type="submit"
                >
                    {translate(locale, "common.save")}
                </button>
            </div>
        </form>
    );
}

function TrashList({
    items,
    locale,
    busy,
    onRestore,
    timeFormat,
    timeZone,
    weightUnit,
}: Shared &
    Readonly<{ busy: string | null; items: TrashItem[]; onRestore: (item: TrashItem) => void }>) {
    return (
        <section className="card">
            <div className="card-heading">
                <div>
                    <h2>{translate(locale, "history.trash")}</h2>
                    <p className="muted trash-hint">{translate(locale, "history.trashHint")}</p>
                </div>
            </div>
            {items.length === 0 ? (
                <EmptyState message={translate(locale, "history.trashEmpty")} />
            ) : (
                <ul className="record-list">
                    {items.map((item) => (
                        <li className="trash-row" key={`${item.recordType}-${item.recordId}`}>
                            <span className="record-text">
                                <strong>
                                    {item.recordType === "entry"
                                        ? entryDisplayLabel(item, locale)
                                        : formatWeight(item.weightGrams, weightUnit, locale)}
                                </strong>
                                <span>
                                    {formatDateTime(item.deletedAt, locale, timeZone, timeFormat)}
                                </span>
                            </span>
                            <button
                                aria-busy={busy === trashKey(item)}
                                className="button"
                                disabled={busy !== null}
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

function EmptyState({ message }: Readonly<{ message: string }>) {
    return (
        <div className="empty-state">
            <span className="state-icon">
                <Inbox aria-hidden="true" size={28} />
            </span>
            <p>{message}</p>
        </div>
    );
}

function recordDate(record: HistoryRecord): string {
    return record.recordType === "entry" ? record.item.startAt : record.item.recordedAt;
}

function recordTitle(
    record: HistoryRecord,
    locale: Locale,
    unit: WeightUnit,
    loneSnacks: ReadonlySet<number>,
): string {
    return record.recordType === "entry"
        ? entryDisplayLabel(record.item, locale, loneSnacks)
        : formatWeight(record.item.weightGrams, unit, locale);
}

function recordDetail(record: HistoryRecord, locale: Locale): string {
    if (record.recordType === "weighIn") return translate(locale, "dashboard.weight");
    return record.item.text || formatDuration(record.item.startAt, record.item.endAt, locale);
}
