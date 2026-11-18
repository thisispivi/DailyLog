"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useState } from "react";

import { sendJson } from "@/core/http/client";
import type { TranslationKey } from "@/core/i18n/catalogs";
import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";

type Status = { key: TranslationKey; tone: "error" | "success" } | null;

const failureMessages: Readonly<Record<number, TranslationKey>> = {
    400: "settings.importInvalid",
    409: "dashboard.activityBlocked",
};

/** Download the whole account as JSON, or import such a file. */
export function BackupControls({ locale }: Readonly<{ locale: Locale }>) {
    const router = useRouter();
    const [isImporting, setIsImporting] = useState(false);
    const [status, setStatus] = useState<Status>(null);

    async function importBackup(event: ChangeEvent<HTMLInputElement>) {
        const input = event.currentTarget;
        const file = input.files?.[0];
        // Clear the input so picking the same file again still fires a change.
        input.value = "";
        if (!file || !window.confirm(translate(locale, "settings.importConfirm"))) return;
        let backup: unknown;
        try {
            backup = JSON.parse(await file.text());
        } catch {
            setStatus({ key: "settings.importInvalid", tone: "error" });
            return;
        }
        setIsImporting(true);
        const { ok, status: code } = await sendJson("/api/backup", "POST", backup);
        setIsImporting(false);
        setStatus(
            ok
                ? { key: "settings.importDone", tone: "success" }
                : { key: failureMessages[code] ?? "common.error", tone: "error" },
        );
        if (ok) router.refresh();
    }

    return (
        <>
            <div className="backup-actions">
                <a className="chip" download href="/api/backup">
                    <Download aria-hidden="true" size={18} />
                    {translate(locale, "settings.downloadJson")}
                </a>
                <label aria-busy={isImporting} className="chip">
                    <Upload aria-hidden="true" size={18} />
                    {translate(locale, isImporting ? "settings.importing" : "settings.importJson")}
                    <input
                        accept="application/json,.json"
                        className="sr-only"
                        disabled={isImporting}
                        onChange={(event) => void importBackup(event)}
                        type="file"
                    />
                </label>
            </div>
            <p aria-live="polite" className="status-message backup-status" data-tone={status?.tone}>
                {status && translate(locale, status.key)}
            </p>
        </>
    );
}
