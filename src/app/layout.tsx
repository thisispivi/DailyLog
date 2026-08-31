import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import type { Locale, Theme } from "@/features/logbook/domain";

import "./globals.css";

export const metadata: Metadata = {
    applicationName: "DailyLog",
    description: "A private journal for meals, training, sleep, and body weight.",
    robots: { follow: false, index: false },
    title: { default: "DailyLog", template: "%s · DailyLog" },
};

export const viewport: Viewport = {
    colorScheme: "light dark",
    themeColor: [
        { color: "#f4f5f3", media: "(prefers-color-scheme: light)" },
        { color: "#0b1423", media: "(prefers-color-scheme: dark)" },
    ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    const cookieStore = await cookies();
    const locale = normalizeLocale(cookieStore.get("dailylog_locale")?.value);
    const theme = normalizeTheme(cookieStore.get("dailylog_theme")?.value);
    return (
        <html
            data-scroll-behavior="smooth"
            lang={locale}
            data-theme={theme}
            suppressHydrationWarning
        >
            <body>{children}</body>
        </html>
    );
}

function normalizeLocale(value: string | undefined): Locale {
    return value === "it" ? "it" : "en";
}

function normalizeTheme(value: string | undefined): Theme {
    return value === "dark" || value === "light" ? value : "system";
}
