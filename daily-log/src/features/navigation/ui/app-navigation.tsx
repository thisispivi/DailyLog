"use client";

import { CalendarDays, ChartNoAxesCombined, History, House, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";
import { Logo } from "@/ui/logo";

import "./app-navigation.css";

const destinations = [
    { href: "/today", icon: House, key: "nav.dashboard" },
    { href: "/calendar", icon: CalendarDays, key: "nav.calendar" },
    { href: "/history", icon: History, key: "nav.history" },
    { href: "/reports", icon: ChartNoAxesCombined, key: "nav.reports" },
    { href: "/settings", icon: Settings, key: "nav.settings" },
] as const;

/** Sidebar on wide screens; a top bar plus a bottom tab bar on phones. */
export function AppNavigation({ locale }: Readonly<{ locale: Locale }>) {
    const pathname = usePathname();
    const router = useRouter();

    async function signOut() {
        await sendJson("/api/auth/logout", "POST");
        router.replace("/login");
        router.refresh();
    }

    return (
        <aside className="sidebar">
            <Link className="sidebar-logo" href="/today">
                <Logo />
            </Link>
            <nav aria-label={translate(locale, "nav.primary")} className="sidebar-nav">
                <ul>
                    {destinations.map(({ href, icon: Icon, key }) => (
                        <li key={href}>
                            <Link
                                aria-current={pathname.startsWith(href) ? "page" : undefined}
                                className="nav-link"
                                href={href}
                            >
                                <Icon aria-hidden="true" size={21} strokeWidth={2.2} />
                                <span>{translate(locale, key)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
            <button className="sign-out" onClick={signOut} type="button">
                <LogOut aria-hidden="true" size={19} />
                <span>{translate(locale, "nav.signOut")}</span>
            </button>
        </aside>
    );
}
