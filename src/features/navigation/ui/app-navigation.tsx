"use client";

import { CalendarDays, ChartNoAxesCombined, History, LogOut, MoonStar } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";

const destinations = [
    { href: "/today", icon: CalendarDays, key: "nav.dashboard" },
    { href: "/history", icon: History, key: "nav.history" },
    { href: "/reports", icon: ChartNoAxesCombined, key: "nav.reports" },
    { href: "/settings", icon: MoonStar, key: "nav.settings" },
] as const;

export function AppNavigation({ locale }: Readonly<{ locale: Locale }>) {
    const pathname = usePathname();
    const router = useRouter();

    async function signOut() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
    }

    return (
        <aside className="sidebar">
            <Link className="brand" href="/today">
                <span className="brand-mark" aria-hidden="true">
                    <span>●</span>
                </span>
                {translate(locale, "app.name")}
            </Link>
            <nav aria-label={translate(locale, "nav.primary")}>
                <ul className="nav-list">
                    {destinations.map(({ href, icon: Icon, key }) => (
                        <li key={href}>
                            <Link
                                className="nav-link"
                                data-active={pathname.startsWith(href)}
                                href={href}
                            >
                                <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                                <span>{translate(locale, key)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className="sidebar-footer">
                <button className="button button-quiet" onClick={signOut} type="button">
                    <LogOut aria-hidden="true" size={18} />
                    {translate(locale, "nav.signOut")}
                </button>
            </div>
        </aside>
    );
}
