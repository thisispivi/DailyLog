"use client";

import { ClipboardCopy, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useState } from "react";

import { sendJson } from "@/core/http/client";
import type { TranslationKey } from "@/core/i18n/catalogs";
import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";
import { dietPrompt } from "@/features/meal-plan/prompt";
import type { Diet } from "@/features/meal-plan/schemas";

type Status = { key: TranslationKey; tone: "error" | "success" } | null;

/** Copy the prompt for an AI assistant, then upload the diet JSON it returns. */
export function DietSetup({ diet, locale }: Readonly<{ diet: Diet | null; locale: Locale }>) {
    const router = useRouter();
    const [isUploading, setIsUploading] = useState(false);
    const [status, setStatus] = useState<Status>(null);

    async function copyPrompt() {
        try {
            await navigator.clipboard.writeText(dietPrompt());
            setStatus({ key: "mealPlan.copied", tone: "success" });
        } catch {
            setStatus({ key: "mealPlan.copyFailed", tone: "error" });
        }
    }

    async function upload(event: ChangeEvent<HTMLInputElement>) {
        const input = event.currentTarget;
        const file = input.files?.[0];
        // Clear the input so picking the same file again still fires a change.
        input.value = "";
        if (!file || (diet && !window.confirm(translate(locale, "mealPlan.replaceConfirm")))) {
            return;
        }
        let document: unknown;
        try {
            document = JSON.parse(await file.text());
        } catch {
            setStatus({ key: "mealPlan.invalidDiet", tone: "error" });
            return;
        }
        setIsUploading(true);
        const { ok, status: code } = await sendJson("/api/diet", "PUT", document);
        setIsUploading(false);
        setStatus(
            ok
                ? { key: "mealPlan.uploaded", tone: "success" }
                : { key: code === 400 ? "mealPlan.invalidDiet" : "common.error", tone: "error" },
        );
        if (ok) router.refresh();
    }

    return (
        <section aria-labelledby="diet-title" className="card diet-setup">
            <div className="card-heading">
                <h2 id="diet-title">{translate(locale, "mealPlan.dietTitle")}</h2>
            </div>
            {diet && diet.notes.length > 0 && (
                <div className="diet-notes">
                    <h3>{translate(locale, "mealPlan.everyMeal")}</h3>
                    <ul>
                        {diet.notes.map((note) => (
                            <li key={note}>{note}</li>
                        ))}
                    </ul>
                </div>
            )}
            <p className="muted">{translate(locale, "mealPlan.setupHint")}</p>
            <ol className="diet-steps">
                <li>{translate(locale, "mealPlan.step1")}</li>
                <li>{translate(locale, "mealPlan.step2")}</li>
                <li>{translate(locale, "mealPlan.step3")}</li>
            </ol>
            <div className="diet-actions">
                <button className="chip" onClick={() => void copyPrompt()} type="button">
                    <ClipboardCopy aria-hidden="true" size={18} />
                    {translate(locale, "mealPlan.copyPrompt")}
                </button>
                <label aria-busy={isUploading} className="chip">
                    <Upload aria-hidden="true" size={18} />
                    {translate(
                        locale,
                        isUploading
                            ? "mealPlan.uploading"
                            : diet
                              ? "mealPlan.replaceDiet"
                              : "mealPlan.uploadDiet",
                    )}
                    <input
                        accept="application/json,.json"
                        className="sr-only"
                        disabled={isUploading}
                        onChange={(event) => void upload(event)}
                        type="file"
                    />
                </label>
            </div>
            <p aria-live="polite" className="status-message diet-status" data-tone={status?.tone}>
                {status && translate(locale, status.key)}
            </p>
        </section>
    );
}
