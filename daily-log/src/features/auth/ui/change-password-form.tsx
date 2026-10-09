"use client";

import { type FormEvent, useState } from "react";

import { sendJson } from "@/core/http/client";
import type { TranslationKey } from "@/core/i18n/catalogs";
import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";

type Status = { key: TranslationKey; tone: "error" | "success" } | null;

const failureMessages: Readonly<Record<number, TranslationKey>> = {
    400: "settings.passwordWrong",
    429: "auth.locked",
};

export function ChangePasswordForm({ locale }: Readonly<{ locale: Locale }>) {
    const [pending, setPending] = useState(false);
    const [status, setStatus] = useState<Status>(null);

    async function changePassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setPending(true);
        setStatus(null);
        const { ok, status: code } = await sendJson("/api/auth/password", "PUT", {
            currentPassword: data.get("currentPassword"),
            newPassword: data.get("newPassword"),
        });
        setPending(false);
        if (ok) form.reset();
        setStatus(
            ok
                ? { key: "settings.passwordChanged", tone: "success" }
                : { key: failureMessages[code] ?? "common.error", tone: "error" },
        );
    }

    return (
        <form className="password-form" onSubmit={(event) => void changePassword(event)}>
            <div className="field">
                <label htmlFor="current-password">
                    {translate(locale, "settings.currentPassword")}
                </label>
                <input
                    autoComplete="current-password"
                    className="input"
                    id="current-password"
                    maxLength={256}
                    name="currentPassword"
                    required
                    type="password"
                />
            </div>
            <div className="field">
                <label htmlFor="new-password">{translate(locale, "settings.newPassword")}</label>
                <input
                    autoComplete="new-password"
                    className="input"
                    id="new-password"
                    maxLength={256}
                    minLength={12}
                    name="newPassword"
                    required
                    type="password"
                />
            </div>
            <button
                aria-busy={pending}
                className="button button-primary"
                disabled={pending}
                type="submit"
            >
                {translate(locale, "settings.savePassword")}
            </button>
            <p
                aria-live="polite"
                className="status-message password-status"
                data-tone={status?.tone}
            >
                {status && translate(locale, status.key)}
            </p>
        </form>
    );
}
