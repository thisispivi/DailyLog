import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { translate } from "@/core/i18n/translate";
import { readSession } from "@/core/security/session";
import { AppNavigation } from "@/features/navigation/ui/app-navigation";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";
import { Toaster } from "@/ui/toast";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: Readonly<{ children: ReactNode }>) {
    const session = await readSession();
    if (!session) redirect("/login");
    const { locale } = new LogbookRepository().getSettings(session.userId);
    return (
        <div className="app-shell">
            <a className="skip-link" href="#main-content">
                {translate(locale, "app.skip")}
            </a>
            <AppNavigation locale={locale} />
            <main className="main-content" id="main-content">
                {children}
            </main>
            <Toaster />
        </div>
    );
}
