import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import brandBanner from "../../../assets/readme/dailylog-banner.png";
import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { readSession } from "@/core/security/session";
import { LoginForm } from "@/features/auth/ui/login-form";
import type { Locale } from "@/features/logbook/domain";

import "./login.css";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
    if (await readSession()) redirect("/today");
    const locale: Locale = (await cookies()).get("dailylog_locale")?.value === "it" ? "it" : "en";
    return (
        <main className="login-page">
            <section className="login-panel" aria-labelledby="login-title">
                <div className="login-brand-crop" aria-hidden="true">
                    <Image
                        alt=""
                        fill
                        priority
                        sizes="(max-width: 760px) 100vw, 48vw"
                        src={brandBanner}
                    />
                </div>
                <div className="login-content">
                    <p className="eyebrow">{translate(locale, "auth.eyebrow")}</p>
                    <h1 id="login-title">{translate(locale, "auth.title")}</h1>
                    <p className="login-tagline">{translate(locale, "app.tagline")}</p>
                    <LoginForm configured={Boolean(getEnvironment().appPassword)} locale={locale} />
                </div>
            </section>
        </main>
    );
}
