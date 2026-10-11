"use client";

import {
    CalendarDays,
    ChartNoAxesCombined,
    CircleUserRound,
    History,
    House,
    LogOut,
    Settings,
    UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

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

    const [isSigningOut, setIsSigningOut] = useState(false);

    async function signOut() {
        setIsSigningOut(true);
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
            {/* Meal plan and profile sit with sign-out so the phone tab bar keeps five destinations. */}
            <div className="sidebar-account">
                <Link
                    aria-current={pathname.startsWith("/meal-plan") ? "page" : undefined}
                    className="account-link"
                    href="/meal-plan"
                >
                    <UtensilsCrossed aria-hidden="true" size={19} />
                    <span>{translate(locale, "nav.mealPlan")}</span>
                </Link>
                <Link
                    aria-current={pathname.startsWith("/profile") ? "page" : undefined}
                    className="account-link"
                    href="/profile"
                >
                    <CircleUserRound aria-hidden="true" size={19} />
                    <span>{translate(locale, "nav.profile")}</span>
                </Link>
                <button
                    aria-busy={isSigningOut}
                    className="account-link"
                    disabled={isSigningOut}
                    onClick={signOut}
                    type="button"
                >
                    <LogOut aria-hidden="true" size={19} />
                    <span>{translate(locale, "nav.signOut")}</span>
                </button>
            </div>
        </aside>
    );
}
