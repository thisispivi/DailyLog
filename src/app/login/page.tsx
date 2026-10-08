import { redirect } from "next/navigation";

import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { readPreferenceCookies } from "@/core/preferences/preference-cookies";
import { readSession } from "@/core/security/session";
import { LoginForm } from "@/features/auth/ui/login-form";
import { RobotButler } from "@/ui/robot-butler";
import { Wordmark } from "@/ui/wordmark";

import "./login.css";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
    if (await readSession()) redirect("/today");
    const { locale } = await readPreferenceCookies();
    return (
        <main className="login-page navy-panel">
            <div className="login-layout">
                <section className="login-intro">
                    <Wordmark markSize={44} />
                    <h1>{translate(locale, "auth.title")}</h1>
                    <p>{translate(locale, "app.tagline")}</p>
                    <RobotButler className="login-robot" />
                </section>
                <section aria-labelledby="login-title" className="login-card card">
                    <p className="eyebrow">{translate(locale, "auth.eyebrow")}</p>
                    <h2 id="login-title">{translate(locale, "auth.heading")}</h2>
                    <LoginForm configured={Boolean(getEnvironment().appPassword)} locale={locale} />
                </section>
            </div>
        </main>
    );
}
