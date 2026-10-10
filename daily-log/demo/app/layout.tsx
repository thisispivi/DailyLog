import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/nunito";
import "../../src/app/globals.css";
import "./demo.css";

export const metadata: Metadata = {
    description:
        "Try DailyLog, a private journal for meals, training, sleep, and body weight, with sample data that stays in your browser.",
    icons: { icon: "/icon.svg" },
    title: "DailyLog · Demo",
};

export const viewport: Viewport = {
    colorScheme: "light dark",
    themeColor: [
        { color: "#f4f1ff", media: "(prefers-color-scheme: light)" },
        { color: "#17142b", media: "(prefers-color-scheme: dark)" },
    ],
};

export default function DemoLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html data-theme="system" lang="en" suppressHydrationWarning>
            <body>{children}</body>
        </html>
    );
}
