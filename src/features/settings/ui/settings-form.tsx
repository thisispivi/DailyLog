"use client";

import { Check, FileText, Languages, MonitorCog, Scale, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import type { Locale, Theme, UserSettings, WeightUnit } from "@/features/logbook/domain";

type Status = { message: string; tone: "error" | "success" } | null;

export function SettingsForm({ initial }: Readonly<{ initial: UserSettings }>) {
    const router = useRouter();
    const [locale, setLocale] = useState<Locale>(initial.locale);
    const [exportLocale, setExportLocale] = useState<Locale>(initial.exportLocale);
    const [theme, setTheme] = useState<Theme>(initial.theme);
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(initial.weightUnit);
    const [pending, setPending] = useState(false);
    const [status, setStatus] = useState<Status>(null);

    const languages: ReadonlyArray<readonly [Locale, string]> = [
        ["en", translate(locale, "settings.english")],
        ["it", translate(locale, "settings.italian")],
    ];

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setStatus(null);
        const { ok } = await sendJson("/api/settings", "PATCH", {
            exportLocale,
            locale,
            theme,
            weightUnit,
        });
        setPending(false);
        if (!ok) {
            setStatus({ message: translate(locale, "common.error"), tone: "error" });
            return;
        }
        setStatus({ message: translate(locale, "common.saved"), tone: "success" });
        router.refresh();
    }

    return (
        <form className="settings-form" onSubmit={save}>
            <SettingSection
                hint={translate(locale, "settings.languageHint")}
                icon={Languages}
                title={translate(locale, "settings.interfaceLanguage")}
            >
                <OptionGroup
                    name="locale"
                    onChange={setLocale}
                    options={languages}
                    title={translate(locale, "settings.interfaceLanguage")}
                    value={locale}
                />
            </SettingSection>
            <SettingSection icon={FileText} title={translate(locale, "settings.documentLanguage")}>
                <OptionGroup
                    name="exportLocale"
                    onChange={setExportLocale}
                    options={languages}
                    title={translate(locale, "settings.documentLanguage")}
                    value={exportLocale}
                />
            </SettingSection>
            <SettingSection
                hint={translate(locale, "settings.themeHint")}
                icon={MonitorCog}
                title={translate(locale, "settings.appearance")}
            >
                <OptionGroup
                    name="theme"
                    onChange={(value) => {
                        setTheme(value);
                        // Preview immediately; the cookie is written when the form is saved.
                        document.documentElement.dataset.theme = value;
                    }}
                    options={[
                        ["system", translate(locale, "settings.system")],
                        ["light", translate(locale, "settings.light")],
                        ["dark", translate(locale, "settings.dark")],
                    ]}
                    title={translate(locale, "settings.appearance")}
                    value={theme}
                />
            </SettingSection>
            <SettingSection icon={Scale} title={translate(locale, "settings.weightUnit")}>
                <OptionGroup
                    name="weightUnit"
                    onChange={setWeightUnit}
                    options={[
                        ["kg", translate(locale, "settings.kilograms")],
                        ["lb", translate(locale, "settings.pounds")],
                    ]}
                    title={translate(locale, "settings.weightUnit")}
                    value={weightUnit}
                />
            </SettingSection>
            <div className="settings-actions">
                <p aria-live="polite" className="status-message" data-tone={status?.tone}>
                    {status?.message}
                </p>
                <button className="button button-primary" disabled={pending} type="submit">
                    <Check aria-hidden="true" size={17} />
                    {translate(locale, "common.save")}
                </button>
            </div>
        </form>
    );
}

function SettingSection({
    children,
    hint,
    icon: Icon,
    title,
}: Readonly<{ children: ReactNode; hint?: string; icon: LucideIcon; title: string }>) {
    return (
        <section className="setting-section card">
            <span className="setting-icon">
                <Icon aria-hidden="true" size={20} />
            </span>
            <div className="setting-content">
                <h2>{title}</h2>
                {hint && <p className="muted">{hint}</p>}
                {children}
            </div>
        </section>
    );
}

function OptionGroup<Value extends string>({
    name,
    onChange,
    options,
    title,
    value,
}: Readonly<{
    name: string;
    onChange: (value: Value) => void;
    options: ReadonlyArray<readonly [Value, string]>;
    title: string;
    value: Value;
}>) {
    return (
        <div aria-label={title} className="option-group" role="radiogroup">
            {options.map(([optionValue, optionLabel]) => (
                <label key={optionValue}>
                    <input
                        checked={value === optionValue}
                        name={name}
                        onChange={() => onChange(optionValue)}
                        type="radio"
                        value={optionValue}
                    />
                    <span>{optionLabel}</span>
                    <Check aria-hidden="true" className="option-check" size={16} />
                </label>
            ))}
        </div>
    );
}
