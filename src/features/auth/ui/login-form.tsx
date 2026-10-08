"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";

export function LoginForm({
    configured,
    locale,
}: Readonly<{ configured: boolean; locale: Locale }>) {
    const router = useRouter();
    const [message, setMessage] = useState(
        configured ? "" : translate(locale, "auth.configuration"),
    );
    const [pending, setPending] = useState(false);

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setMessage("");
        const password = new FormData(event.currentTarget).get("password");
        const { ok, status } = await sendJson("/api/auth/login", "POST", { password });
        if (ok) {
            router.replace("/today");
            router.refresh();
            return;
        }
        setMessage(translate(locale, status === 429 ? "auth.locked" : "auth.invalid"));
        setPending(false);
    }

    return (
        <form className="login-form" onSubmit={signIn}>
            <div className="field">
                <label htmlFor="password">{translate(locale, "auth.password")}</label>
                <div className="password-field">
                    <LockKeyhole aria-hidden="true" size={18} />
                    <input
                        autoComplete="current-password"
                        autoFocus
                        className="input"
                        disabled={!configured || pending}
                        id="password"
                        minLength={12}
                        name="password"
                        required
                        type="password"
                    />
                </div>
            </div>
            <button
                className="button button-primary login-submit"
                disabled={!configured || pending}
                type="submit"
            >
                {translate(locale, "auth.submit")}
            </button>
            <p aria-live="polite" className="status-message" data-tone="error">
                {message}
            </p>
        </form>
    );
}
