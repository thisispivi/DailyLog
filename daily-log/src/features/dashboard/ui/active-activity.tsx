"use client";

import { Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { sendJson } from "@/core/http/client";
import { formatDuration, translate } from "@/core/i18n/translate";
import type { Entry, Locale } from "@/features/logbook/domain";
import { entryDisplayLabel } from "@/features/logbook/entry-label";
import { KindIcon } from "@/ui/kind-icon";

const CLOCK_TICK_MS = 30_000;

export function ActiveActivity({
    activity,
    locale,
}: Readonly<{ activity: Entry; locale: Locale }>) {
    const router = useRouter();
    const [now, setNow] = useState(() => new Date().toISOString());
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date().toISOString()), CLOCK_TICK_MS);
        return () => window.clearInterval(timer);
    }, []);

    async function settle(request: Promise<{ ok: boolean }>) {
        setPending(true);
        const { ok } = await request;
        setPending(false);
        setFailed(!ok);
        if (ok) router.refresh();
    }

    function finish() {
        void settle(
            sendJson("/api/activities/current", "PATCH", { endAt: new Date().toISOString() }),
        );
    }

    function cancel() {
        if (!window.confirm(translate(locale, "dashboard.confirmCancel"))) return;
        void settle(sendJson("/api/activities/current", "DELETE"));
    }

    return (
        <section aria-live="polite" className="active-activity tile" data-kind={activity.kind}>
            <span className="active-pulse">
                <KindIcon kind={activity.kind} size="large" />
            </span>
            <div className="active-text">
                <p className="eyebrow">{translate(locale, "dashboard.inProgress")}</p>
                <h2>{entryDisplayLabel(activity, locale)}</h2>
                <p>
                    {translate(locale, "dashboard.activeFor", {
                        duration: formatDuration(activity.startAt, now, locale),
                    })}
                </p>
                {failed && (
                    <p className="status-message" data-tone="error">
                        {translate(locale, "common.error")}
                    </p>
                )}
            </div>
            <div className="active-actions">
                <button
                    className="button button-primary"
                    aria-busy={pending}
                    disabled={pending}
                    onClick={finish}
                    type="button"
                >
                    <Square aria-hidden="true" fill="currentColor" size={14} />
                    {translate(locale, "common.end")}
                </button>
                <button
                    aria-label={translate(locale, "dashboard.cancelActivity")}
                    className="icon-button active-cancel"
                    aria-busy={pending}
                    disabled={pending}
                    onClick={cancel}
                    type="button"
                >
                    <Trash2 aria-hidden="true" size="small" />
                </button>
            </div>
        </section>
    );
}
