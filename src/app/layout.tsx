import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import type { ReactNode } from "react";

import { readPreferenceCookies } from "@/core/preferences/preference-cookies";

import "./globals.css";

// Self-hosted at build time, so the CSP can keep font-src 'self'.
const brandFont = Nunito({
    display: "swap",
    subsets: ["latin"],
    variable: "--font-brand",
});

export const metadata: Metadata = {
    applicationName: "DailyLog",
    description: "A private journal for meals, training, sleep, and body weight.",
    robots: { follow: false, index: false },
    title: { default: "DailyLog", template: "%s · DailyLog" },
};

export const viewport: Viewport = {
    colorScheme: "light dark",
    themeColor: [
        { color: "#f4f1ff", media: "(prefers-color-scheme: light)" },
        { color: "#17142b", media: "(prefers-color-scheme: dark)" },
    ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    const { locale, theme } = await readPreferenceCookies();
    return (
        <html
            className={brandFont.variable}
            data-scroll-behavior="smooth"
            data-theme={theme}
            lang={locale}
            suppressHydrationWarning
        >
            <body>{children}</body>
        </html>
    );
}
