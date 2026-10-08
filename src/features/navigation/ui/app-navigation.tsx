"use client";

import { ChartNoAxesCombined, History, LogOut, NotebookPen, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";
import { Wordmark } from "@/ui/wordmark";

import "./app-navigation.css";

const destinations = [
    { href: "/today", icon: NotebookPen, key: "nav.dashboard" },
    { href: "/history", icon: History, key: "nav.history" },
    { href: "/reports", icon: ChartNoAxesCombined, key: "nav.reports" },
    { href: "/settings", icon: Settings2, key: "nav.settings" },
] as const;

/** Navy sidebar on wide screens; a top bar plus a floating tab bar on phones. */
export function AppNavigation({ locale }: Readonly<{ locale: Locale }>) {
    const pathname = usePathname();
    const router = useRouter();

    async function signOut() {
        await sendJson("/api/auth/logout", "POST");
        router.replace("/login");
        router.refresh();
    }

    const signOutLabel = translate(locale, "nav.signOut");

    return (
        <aside className="sidebar navy-panel">
            <Link
                aria-label={translate(locale, "nav.dashboard")}
                className="sidebar-brand"
                href="/today"
            >
                <Wordmark />
            </Link>
            <nav aria-label={translate(locale, "nav.primary")} className="sidebar-nav">
                <ul>
                    {destinations.map(({ href, icon: Icon, key }) => {
                        const active = pathname.startsWith(href);
                        return (
                            <li key={href}>
                                <Link
                                    aria-current={active ? "page" : undefined}
                                    className="nav-link"
                                    href={href}
                                >
                                    <Icon aria-hidden="true" size={20} strokeWidth={2} />
                                    <span>{translate(locale, key)}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>
            <button className="sign-out" onClick={signOut} type="button">
                <LogOut aria-hidden="true" size={18} />
                <span>{signOutLabel}</span>
            </button>
        </aside>
    );
}
