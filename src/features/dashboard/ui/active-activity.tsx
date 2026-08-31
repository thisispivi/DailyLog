"use client";

import { Moon, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatDuration, translate } from "@/core/i18n/translate";
import type { Entry, Locale } from "@/features/logbook/domain";

export function ActiveActivity({
    activity,
    locale,
}: Readonly<{ activity: Entry; locale: Locale }>) {
    const router = useRouter();
    const [now, setNow] = useState(() => new Date().toISOString());
    const [pending, setPending] = useState(false);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    async function mutate(method: "DELETE" | "PATCH") {
        if (method === "DELETE" && !window.confirm(translate(locale, "dashboard.cancelActivity")))
            return;
        setPending(true);
        const response = await fetch("/api/activities/current", {
            ...(method === "PATCH"
                ? {
                      body: JSON.stringify({ endAt: new Date().toISOString() }),
                      headers: { "content-type": "application/json" },
                  }
                : {}),
            method,
        });
        setPending(false);
        if (response.ok) router.refresh();
    }

    return (
        <section className="active-activity" aria-live="polite">
            <div className="active-icon" aria-hidden="true">
                {activity.kind === "sleep" ? <Moon size={25} /> : <span className="pulse-dot" />}
            </div>
            <div>
                <p className="eyebrow">{translate(locale, `dashboard.${activity.kind}`)}</p>
                <h2>{activity.label}</h2>
                <p>
                    {translate(locale, "dashboard.activeFor", {
                        duration: formatDuration(activity.startAt, now, locale),
                    })}
                </p>
            </div>
            <div className="active-actions">
                <button
                    className="button active-end"
                    disabled={pending}
                    onClick={() => mutate("PATCH")}
                    type="button"
                >
                    <Square aria-hidden="true" size={15} fill="currentColor" />
                    {translate(locale, "common.end")}
                </button>
                <button
                    aria-label={translate(locale, "dashboard.cancelActivity")}
                    className="icon-button active-cancel"
                    disabled={pending}
                    onClick={() => mutate("DELETE")}
                    type="button"
                >
                    <Trash2 aria-hidden="true" size={18} />
                </button>
            </div>
        </section>
    );
}
