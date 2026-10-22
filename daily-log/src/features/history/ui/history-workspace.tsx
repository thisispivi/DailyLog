"use client";

import { ChevronLeft, ChevronRight, Inbox, RotateCcw, Search, Trash2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
    type FormEvent,
    type ReactNode,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition,
} from "react";

import { sendJson } from "@/core/http/client";
import {
    formatDate,
    formatDateTime,
    formatDuration,
    formatWeight,
    translate,
} from "@/core/i18n/translate";
import { localInputToUtc, localInputValue } from "@/core/time/zoned-time";
import { entryDisplayLabel } from "@/features/logbook/entry-label";
import {
    entryKinds,
    gramsToUnit,
    type HistoryRecord,
    type HistoryType,
    type Locale,
    type TimeFormat,
    type TrashItem,
    type WeightUnit,
} from "@/features/logbook/domain";
import { DateTimeField } from "@/ui/date-time-field";
import { KindIcon } from "@/ui/kind-icon";
import { Select } from "@/ui/select";
import { Sheet } from "@/ui/sheet";
import { showToast } from "@/ui/toast";

const filters = [
    { key: "history.all", kind: undefined, value: "all" },
    { key: "history.meal", kind: "meal", value: "meal" },
    { key: "history.training", kind: "training", value: "training" },
    { key: "history.sleep", kind: "sleep", value: "sleep" },
    { key: "history.weighIns", kind: "weight", value: "weighIn" },
    { key: "history.trash", kind: undefined, value: "trash" },
] as const;

/** What History shows, as read from and written to the URL. */
export type HistoryView = Readonly<{
    from?: string;
    page: number;
    q?: string;
    to?: string;
    type?: HistoryType | "trash";
}>;

type ViewChanges = { [Key in keyof HistoryView]?: HistoryView[Key] | undefined };

const viewKeys = ["type", "q", "from", "to", "page"] as const;
const SEARCH_DELAY_MS = 300;

type EditorMessage = "toast.changesSaved" | "toast.movedToTrash";

const trashKey = (item: TrashItem) => `${item.recordType}-${item.recordId}`;

type Shared = Readonly<{
    locale: Locale;
    timeFormat: TimeFormat;
    timeZone: string;
    weightUnit: WeightUnit;
}>;

export function HistoryWorkspace({
    locale,
    loneSnacks,
    pageCount,
    records,
    timeFormat,
    timeZone,
    total,
    trash,
    view,
    weightUnit,
}: Shared &
    Readonly<{
        loneSnacks: readonly number[];
        pageCount: number;
        records: readonly HistoryRecord[];
        total: number;
        trash: readonly TrashItem[];
        view: HistoryView;
    }>) {
    const router = useRouter();
    const pathname = usePathname();
    const [isLoading, startLoading] = useTransition();
    const [loadingPage, setLoadingPage] = useState<number | null>(null);
    // ponytail: the box keeps what was typed; going Back to an older search doesn't rewrite it.
    const [query, setQuery] = useState(view.q ?? "");
    const searchTimer = useRef<number | undefined>(undefined);
    const resultsHeading = useRef<HTMLHeadingElement>(null);
    const focusResultsOnPage = useRef<number | null>(null);
    // The record stays set while the sheet closes, so its exit shows the editor, not an empty sheet.
    const [editing, setEditing] = useState<HistoryRecord | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const shared = { locale, timeFormat, timeZone, weightUnit };
    const lone = useMemo(() => new Set(loneSnacks), [loneSnacks]);
    const filter = view.type ?? "all";
    const hasFilters = filter !== "all" || Boolean(view.q || view.from || view.to);
    const singleDay = view.from && view.from === view.to ? view.from : undefined;

    // After paging, focus the new results so keyboard users don't stay on a disabled button.
    useEffect(() => {
        if (focusResultsOnPage.current !== view.page) return;
        focusResultsOnPage.current = null;
        resultsHeading.current?.focus();
    }, [view.page]);

    /** Loads another view from the server; any filter change starts again from page 1. */
    function show(changes: ViewChanges, { replace = false, scroll = false } = {}) {
        const next: ViewChanges = { ...view, page: 1, ...changes };
        const params = new URLSearchParams();
        for (const key of viewKeys) {
            const value = next[key];
            if (value === undefined || value === "" || (key === "page" && value === 1)) continue;
            params.set(key, String(value));
        }
        const href = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
        startLoading(() => {
            if (replace) router.replace(href, { scroll });
            else router.push(href, { scroll });
        });
    }

    function goToPage(page: number) {
        setLoadingPage(page);
        focusResultsOnPage.current = page;
        show({ page }, { scroll: true });
    }

    function search(value: string) {
        setQuery(value);
        window.clearTimeout(searchTimer.current);
        // Wait for a pause in typing, and replace the URL so each keystroke isn't a Back step.
        searchTimer.current = window.setTimeout(
            () => show({ q: value.trim() || undefined }, { replace: true }),
            SEARCH_DELAY_MS,
        );
    }

    function clearFilters() {
        window.clearTimeout(searchTimer.current);
        setQuery("");
        show({ from: undefined, q: undefined, to: undefined, type: undefined });
    }

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

    function deleteDay(day: string) {
        const label = formatDate(`${day}T12:00:00Z`, locale, "UTC");
        if (!window.confirm(translate(locale, "history.confirmBulk", { date: label }))) return;
        void mutate(
            "day",
            sendJson("/api/entries/day", "DELETE", { date: day }),
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
                        maxLength={120}
                        onChange={(event) => search(event.currentTarget.value)}
                        placeholder={translate(locale, "history.searchPlaceholder")}
                        type="search"
                        value={query}
                    />
                </div>
                <div className="history-dates">
                    <DateTimeField
                        clearable
                        id="history-from"
                        label={translate(locale, "history.from")}
                        labelHidden
                        locale={locale}
                        mode="date"
                        onChange={(from) => show({ from: from || undefined })}
                        placeholder={translate(locale, "history.from")}
                        timeZone={timeZone}
                        value={view.from ?? ""}
                    />
                    <DateTimeField
                        clearable
                        fallbackDate={view.from ?? ""}
                        id="history-to"
                        label={translate(locale, "history.to")}
                        labelHidden
                        locale={locale}
                        mode="date"
                        onChange={(to) => show({ to: to || undefined })}
                        placeholder={translate(locale, "history.to")}
                        timeZone={timeZone}
                        value={view.to ?? ""}
                    />
                </div>
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
                            onClick={() => show({ type: value === "all" ? undefined : value })}
                            type="button"
                        >
                            {translate(locale, key)}
                        </button>
                    ))}
                </div>
            </section>
            {singleDay && filter !== "trash" && (
                <button
                    aria-busy={busy === "day"}
                    className="button button-danger history-bulk"
                    disabled={busy !== null}
                    onClick={() => deleteDay(singleDay)}
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
                <section aria-busy={isLoading} className="card history-results">
                    <div className="card-heading">
                        <h2 ref={resultsHeading} tabIndex={-1}>
                            {translate(locale, "history.title")}
                        </h2>
                        <span aria-busy={isLoading} aria-live="polite" className="pill numeric">
                            {isLoading && (
                                <span className="sr-only">
                                    {translate(locale, "common.loading")}
                                </span>
                            )}
                            {translate(locale, "history.results", { count: total })}
                        </span>
                    </div>
                    {records.length === 0 ? (
                        <EmptyState
                            message={translate(
                                locale,
                                hasFilters ? "history.noMatches" : "history.empty",
                            )}
                        >
                            {hasFilters && (
                                <button
                                    className="button button-ghost"
                                    onClick={clearFilters}
                                    type="button"
                                >
                                    <X aria-hidden="true" size={16} />
                                    {translate(locale, "history.clearFilters")}
                                </button>
                            )}
                        </EmptyState>
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
                                                {recordTitle(record, locale, weightUnit, lone)}
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
                    {pageCount > 1 && (
                        <nav
                            aria-label={translate(locale, "history.pages")}
                            className="history-pagination"
                        >
                            <button
                                aria-busy={isLoading && loadingPage === view.page - 1}
                                className="button button-ghost"
                                disabled={view.page <= 1 || isLoading}
                                onClick={() => goToPage(view.page - 1)}
                                type="button"
                            >
                                <ChevronLeft aria-hidden="true" size={18} />
                                {translate(locale, "history.previousPage")}
                            </button>
                            <span className="muted numeric">
                                {translate(locale, "history.pageOf", {
                                    page: view.page,
                                    pages: pageCount,
                                })}
                            </span>
                            <button
                                aria-busy={isLoading && loadingPage === view.page + 1}
                                className="button button-ghost"
                                disabled={view.page >= pageCount || isLoading}
                                onClick={() => goToPage(view.page + 1)}
                                type="button"
                            >
                                {translate(locale, "history.nextPage")}
                                <ChevronRight aria-hidden="true" size={18} />
                            </button>
                        </nav>
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
    Readonly<{
        busy: string | null;
        items: readonly TrashItem[];
        onRestore: (item: TrashItem) => void;
    }>) {
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

function EmptyState({ children, message }: Readonly<{ children?: ReactNode; message: string }>) {
    return (
        <div className="empty-state">
            <span className="state-icon">
                <Inbox aria-hidden="true" size={28} />
            </span>
            <p>{message}</p>
            {children}
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
