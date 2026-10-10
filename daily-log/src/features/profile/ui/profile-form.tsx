"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import {
    gramsToUnit,
    type Locale,
    weightToGrams,
    type WeightUnit,
} from "@/features/logbook/domain";
import type { UserProfile } from "@/features/profile/profile";
import { HEIGHT_RANGE_CM } from "@/features/profile/schemas";
import { DateTimeField } from "@/ui/date-time-field";

type Status = { message: string; tone: "error" | "success" } | null;

/** Text fields save when they lose focus and the birth date when it is picked; no save button. */
export function ProfileForm({
    initial,
    locale,
    timeZone,
    weightUnit,
}: Readonly<{ initial: UserProfile; locale: Locale; timeZone: string; weightUnit: WeightUnit }>) {
    const router = useRouter();
    const [saved, setSaved] = useState(initial);
    const [status, setStatus] = useState<Status>(null);

    async function save(changes: Partial<UserProfile>) {
        const { ok, status: code } = await sendJson("/api/profile", "PATCH", changes);
        if (ok) setSaved({ ...saved, ...changes });
        setStatus({
            message: translate(
                locale,
                ok ? "common.saved" : code === 400 ? "common.validation" : "common.error",
            ),
            tone: ok ? "success" : "error",
        });
        if (ok) router.refresh();
    }

    function saveName(key: "firstName" | "lastName", value: string) {
        const name = value.trim();
        if (name !== saved[key]) void save({ [key]: name });
    }

    function saveHeight(value: string) {
        const heightCm = value ? Number(value) : null;
        if (heightCm !== saved.heightCm) void save({ heightCm });
    }

    function saveGoalWeight(value: string) {
        const goalWeightGrams = value ? weightToGrams(Number(value), weightUnit) : null;
        if (goalWeightGrams !== saved.goalWeightGrams) void save({ goalWeightGrams });
    }

    return (
        <section aria-labelledby="profile-form-title" className="card profile-form">
            <div className="card-heading">
                <h2 id="profile-form-title">{translate(locale, "profile.aboutYou")}</h2>
            </div>
            <p
                aria-live="polite"
                className="status-message profile-status"
                data-tone={status?.tone}
            >
                {status?.message}
            </p>
            <div className="form-grid">
                <div className="field">
                    <label htmlFor="profile-first-name">
                        {translate(locale, "profile.firstName")}
                    </label>
                    <input
                        autoComplete="given-name"
                        className="input"
                        defaultValue={initial.firstName}
                        id="profile-first-name"
                        maxLength={60}
                        onBlur={(event) => saveName("firstName", event.currentTarget.value)}
                    />
                </div>
                <div className="field">
                    <label htmlFor="profile-last-name">
                        {translate(locale, "profile.lastName")}
                    </label>
                    <input
                        autoComplete="family-name"
                        className="input"
                        defaultValue={initial.lastName}
                        id="profile-last-name"
                        maxLength={60}
                        onBlur={(event) => saveName("lastName", event.currentTarget.value)}
                    />
                </div>
                <DateTimeField
                    clearable
                    defaultValue={initial.birthDate ?? ""}
                    id="profile-birth-date"
                    label={translate(locale, "profile.birthDate")}
                    locale={locale}
                    mode="date"
                    onChange={(value) => void save({ birthDate: value || null })}
                    timeZone={timeZone}
                    yearPicker
                />
                <div className="field">
                    <label htmlFor="profile-height">{translate(locale, "profile.heightCm")}</label>
                    <input
                        className="input numeric"
                        defaultValue={initial.heightCm ?? ""}
                        id="profile-height"
                        inputMode="numeric"
                        max={HEIGHT_RANGE_CM.max}
                        min={HEIGHT_RANGE_CM.min}
                        onBlur={(event) => saveHeight(event.currentTarget.value)}
                        step={1}
                        type="number"
                    />
                </div>
                <div className="field">
                    <label htmlFor="profile-goal-weight">
                        {translate(locale, "profile.goalWeight", { unit: weightUnit })}
                    </label>
                    <input
                        className="input numeric"
                        defaultValue={
                            initial.goalWeightGrams === null
                                ? ""
                                : Math.round(
                                      gramsToUnit(initial.goalWeightGrams, weightUnit) * 10,
                                  ) / 10
                        }
                        id="profile-goal-weight"
                        inputMode="decimal"
                        max={1000}
                        min={1}
                        onBlur={(event) => saveGoalWeight(event.currentTarget.value)}
                        step={0.1}
                        type="number"
                    />
                </div>
                <DateTimeField
                    clearable
                    defaultValue={initial.goalDate ?? ""}
                    id="profile-goal-date"
                    label={translate(locale, "profile.goalDate")}
                    locale={locale}
                    mode="date"
                    onChange={(value) => void save({ goalDate: value || null })}
                    timeZone={timeZone}
                />
            </div>
        </section>
    );
}
