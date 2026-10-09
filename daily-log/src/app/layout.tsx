import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { readPreferenceCookies } from "@/core/preferences/preference-cookies";

// Bundled from node_modules, so builds work offline and the CSP keeps font-src 'self'.
import "@fontsource-variable/nunito";
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
        { color: "#f4f1ff", media: "(prefers-color-scheme: light)" },
        { color: "#17142b", media: "(prefers-color-scheme: dark)" },
    ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    const { locale, theme } = await readPreferenceCookies();
    return (
        <html
            data-scroll-behavior="smooth"
            data-theme={theme}
            lang={locale}
            suppressHydrationWarning
        >
            <body>{children}</body>
        </html>
    );
}
