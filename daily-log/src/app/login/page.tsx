import { redirect } from "next/navigation";

import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { localizedTitle, readPreferenceCookies } from "@/core/preferences/preference-cookies";
import { readSession } from "@/core/security/session";
import { LoginForm } from "@/features/auth/ui/login-form";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";
import { KindIcon, recordKinds } from "@/ui/kind-icon";
import { Logo } from "@/ui/logo";

import "./login.css";

export const generateMetadata = () => localizedTitle("auth.heading");

export default async function LoginPage() {
    if (await readSession()) redirect("/today");
    const { locale } = await readPreferenceCookies();
    // Matches the sign-in route: a password set in Settings replaces APP_PASSWORD.
    const { appPassword, ownerId, sessionSecret } = getEnvironment();
    const configured = Boolean(
        sessionSecret && (appPassword || new LogbookRepository().getPasswordHash(ownerId)),
    );
    return (
        <main className="login-page">
            <section aria-labelledby="login-title" className="login-card card">
                <Logo />
                <div aria-hidden="true" className="login-kinds">
                    {recordKinds.map((kind) => (
                        <KindIcon key={kind} kind={kind} />
                    ))}
                </div>
                <h1 id="login-title">{translate(locale, "auth.heading")}</h1>
                <p className="muted">{translate(locale, "app.tagline")}</p>
                <LoginForm configured={configured} locale={locale} />
            </section>
        </main>
    );
}
