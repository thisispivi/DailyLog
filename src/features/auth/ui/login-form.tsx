"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

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

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!configured) return;
        setPending(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/auth/login", {
            body: JSON.stringify({ password: form.get("password") }),
            headers: { "content-type": "application/json" },
            method: "POST",
        });
        if (response.ok) {
            router.replace("/today");
            router.refresh();
            return;
        }
        setMessage(
            response.status === 429
                ? translate(locale, "auth.locked")
                : translate(locale, "auth.invalid"),
        );
        setPending(false);
    }

    return (
        <form className="login-form" onSubmit={submit}>
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
            <p aria-live="polite" className="status-message">
                {message}
            </p>
        </form>
    );
}
