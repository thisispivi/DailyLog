"use client";

import { RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";

import CalendarPage from "@/app/(app)/calendar/page";
import HistoryPage from "@/app/(app)/history/page";
import MealPlanPage from "@/app/(app)/meal-plan/page";
import ProfilePage from "@/app/(app)/profile/page";
import ReportsPage from "@/app/(app)/reports/page";
import SettingsPage from "@/app/(app)/settings/page";
import TodayPage from "@/app/(app)/today/page";
import LoginPage from "@/app/login/page";
import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { readSession } from "@/core/security/session";
import type { Locale } from "@/features/logbook/domain";
import { AppNavigation } from "@/features/navigation/ui/app-navigation";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";
import { Toaster } from "@/ui/toast";

import { handleDemoRequest } from "@demo/shell/api";
import { forgetDemoDatabase, openDemoDatabase, saveDemoDatabase } from "@demo/shell/database";
import { seedDemo } from "@demo/shell/seed";
import { demoVersion, subscribeToDemo } from "@demo/shell/store";

type Page = (props: {
    searchParams: Promise<Record<string, string>>;
}) => ReactNode | Promise<ReactNode>;

const demoViews = {
    calendar: CalendarPage,
    history: HistoryPage,
    login: LoginPage,
    "meal-plan": MealPlanPage,
    profile: ProfilePage,
    reports: ReportsPage,
    settings: SettingsPage,
    today: TodayPage,
} as unknown as Readonly<Record<string, Page>>;

type Rendered = { content: ReactNode; locale: Locale };

// Each link is a new static page that mounts DemoApp again. These live for the
// whole tab, so the database opens and seeds once and the previous page stays on
// screen until the next one has rendered, instead of a loading message per click.
let opened: Promise<void> | null = null;
let isOpen = false;
let lastRendered: Rendered | null = null;

function openOnce(): Promise<void> {
    opened ??= openDemoDatabase().then((isNew) => {
        if (isNew) {
            // Start in the visitor's language; the settings page can switch it later.
            seedDemo(getEnvironment().timezone, navigator.language.startsWith("it") ? "it" : "en");
            saveDemoDatabase();
        }
        isOpen = true;
    });
    return opened;
}

/** next/navigation's redirect() throws an error whose digest carries the target. */
function redirectTarget(error: unknown): string | null {
    const digest = (error as { digest?: unknown } | null)?.digest;
    return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")
        ? (digest.split(";")[2] ?? null)
        : null;
}

/**
 * Runs the real page for `view` in the browser: the page reads the demo's
 * SQLite database exactly as it reads the server's, and re-renders after
 * every change, the way router.refresh() does in the app.
 */
export function DemoApp({ view }: Readonly<{ view: string }>) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const version = useSyncExternalStore(subscribeToDemo, demoVersion, () => 0);
    const [state, setState] = useState<"failed" | "loading" | "ready">(() =>
        isOpen ? "ready" : "loading",
    );
    const [rendered, setRendered] = useState<Rendered | null>(lastRendered);

    useEffect(() => {
        openOnce().then(
            () => setState("ready"),
            () => setState("failed"),
        );
    }, []);

    useEffect(() => {
        if (state !== "ready") return;
        let cancelled = false;
        void (async () => {
            try {
                if (view !== "login" && !(await readSession())) {
                    router.replace("/login");
                    return;
                }
                const { locale, theme } = new LogbookRepository().getSettings(1);
                document.documentElement.lang = locale;
                document.documentElement.dataset.theme = theme;
                const page = demoViews[view] ?? demoViews.today;
                const content = await page?.({
                    searchParams: Promise.resolve(Object.fromEntries(searchParams)),
                });
                if (!cancelled) {
                    lastRendered = { content, locale };
                    setRendered(lastRendered);
                }
            } catch (error) {
                const target = redirectTarget(error);
                if (target) router.replace(target);
                else if (!cancelled) setState("failed");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [router, searchParams, state, version, view]);

    // Downloads and the export form point at /api; answer them here too.
    useEffect(() => {
        const locale = rendered?.locale ?? "en";
        async function download(path: string) {
            const response = await handleDemoRequest(path, "GET");
            if (!response.ok) {
                window.alert(translate(locale, "demo.unavailable"));
                return;
            }
            const name = /filename="([^"]+)"/.exec(
                response.headers.get("content-disposition") ?? "",
            )?.[1];
            const link = document.createElement("a");
            link.href = URL.createObjectURL(await response.blob());
            link.download = name ?? "dailylog";
            link.click();
            URL.revokeObjectURL(link.href);
        }
        function onClick(event: MouseEvent) {
            const link = (event.target as Element | null)?.closest("a[href^='/api/']");
            if (!link) return;
            event.preventDefault();
            void download(link.getAttribute("href") ?? "");
        }
        function onSubmit(event: SubmitEvent) {
            const form = event.target as HTMLFormElement;
            const action = form.getAttribute("action") ?? "";
            if (!action.startsWith("/api/")) return;
            event.preventDefault();
            const query = new URLSearchParams(
                [...new FormData(form)].map(([key, value]) => [key, String(value)]),
            );
            void download(`${action}?${query}`);
        }
        document.addEventListener("click", onClick, true);
        document.addEventListener("submit", onSubmit, true);
        return () => {
            document.removeEventListener("click", onClick, true);
            document.removeEventListener("submit", onSubmit, true);
        };
    }, [rendered?.locale]);

    if (state === "failed") {
        return <p className="demo-message">{translate("en", "demo.failed")}</p>;
    }
    if (!rendered) {
        return (
            <div className="page-loading" role="status">
                <span className="sr-only">{translate("en", "demo.loading")}</span>
                <i />
                <i />
                <i />
            </div>
        );
    }

    const banner = <DemoBanner locale={rendered.locale} />;
    if (view === "login") {
        return (
            <>
                {banner}
                {rendered.content}
            </>
        );
    }
    return (
        <div className="app-shell">
            <a className="skip-link" href="#main-content">
                {translate(rendered.locale, "app.skip")}
            </a>
            <AppNavigation locale={rendered.locale} />
            <main className="main-content" id="main-content">
                {banner}
                {rendered.content}
            </main>
            <Toaster />
        </div>
    );
}

function DemoBanner({ locale }: Readonly<{ locale: Locale }>) {
    function reset() {
        if (!window.confirm(translate(locale, "demo.resetConfirm"))) return;
        forgetDemoDatabase();
        // A full reload reopens the now-empty database, which seeds it again.
        window.location.reload();
    }
    return (
        <aside aria-label={translate(locale, "demo.label")} className="demo-banner">
            <p>{translate(locale, "demo.banner")}</p>
            <button className="chip" onClick={reset} type="button">
                <RotateCcw aria-hidden="true" size={16} />
                {translate(locale, "demo.reset")}
            </button>
        </aside>
    );
}
