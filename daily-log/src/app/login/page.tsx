import { redirect } from "next/navigation";

import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { localizedTitle, readPreferenceCookies } from "@/core/preferences/preference-cookies";
import { readSession } from "@/core/security/session";
import { LoginForm } from "@/features/auth/ui/login-form";
import { KindIcon, recordKinds } from "@/ui/kind-icon";
import { Logo } from "@/ui/logo";

import "./login.css";

export const generateMetadata = () => localizedTitle("auth.heading");

export default async function LoginPage() {
    if (await readSession()) redirect("/today");
    const { locale } = await readPreferenceCookies();
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
                <LoginForm configured={Boolean(getEnvironment().appPassword)} locale={locale} />
            </section>
        </main>
    );
}
