"use client";

import { Check, Languages, MonitorCog, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { translate } from "@/core/i18n/translate";
import type { Locale, Theme, UserSettings, WeightUnit } from "@/features/logbook/domain";

export function SettingsForm({ initial }: Readonly<{ initial: UserSettings }>) {
    const router = useRouter();
    const [locale, setLocale] = useState<Locale>(initial.locale);
    const [exportLocale, setExportLocale] = useState<Locale>(initial.exportLocale);
    const [theme, setTheme] = useState<Theme>(initial.theme);
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(initial.weightUnit);
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setMessage("");
        const response = await fetch("/api/settings", {
            body: JSON.stringify({ exportLocale, locale, theme, weightUnit }),
            headers: { "content-type": "application/json" },
            method: "PATCH",
        });
        setPending(false);
        if (!response.ok) {
            setMessage(translate(locale, "common.error"));
            return;
        }
        applyTheme(theme);
        setMessage(translate(locale, "common.saved"));
        router.refresh();
    }

    return (
        <form className="settings-form" onSubmit={submit}>
            <SettingSection
                icon={Languages}
                title={translate(locale, "settings.interfaceLanguage")}
            >
                <p>{translate(locale, "settings.languageHint")}</p>
                <OptionGroup
                    label={translate(locale, "settings.interfaceLanguage")}
                    name="locale"
                    onChange={(value) => setLocale(value as Locale)}
                    options={[
                        ["en", translate(locale, "settings.english")],
                        ["it", translate(locale, "settings.italian")],
                    ]}
                    value={locale}
                />
                <div className="setting-subsection">
                    <span className="field-label">
                        {translate(locale, "settings.documentLanguage")}
                    </span>
                    <OptionGroup
                        label={translate(locale, "settings.documentLanguage")}
                        name="exportLocale"
                        onChange={(value) => setExportLocale(value as Locale)}
                        options={[
                            ["en", translate(locale, "settings.english")],
                            ["it", translate(locale, "settings.italian")],
                        ]}
                        value={exportLocale}
                    />
                </div>
            </SettingSection>
            <SettingSection icon={MonitorCog} title={translate(locale, "settings.appearance")}>
                <p>{translate(locale, "settings.themeHint")}</p>
                <OptionGroup
                    label={translate(locale, "settings.appearance")}
                    name="theme"
                    onChange={(value) => {
                        setTheme(value as Theme);
                        applyTheme(value as Theme);
                    }}
                    options={[
                        ["system", translate(locale, "settings.system")],
                        ["light", translate(locale, "settings.light")],
                        ["dark", translate(locale, "settings.dark")],
                    ]}
                    value={theme}
                />
            </SettingSection>
            <SettingSection icon={Scale} title={translate(locale, "settings.weightUnit")}>
                <OptionGroup
                    label={translate(locale, "settings.weightUnit")}
                    name="weightUnit"
                    onChange={(value) => setWeightUnit(value as WeightUnit)}
                    options={[
                        ["kg", translate(locale, "settings.kilograms")],
                        ["lb", translate(locale, "settings.pounds")],
                    ]}
                    value={weightUnit}
                />
            </SettingSection>
            <div className="settings-actions">
                <p aria-live="polite">{message}</p>
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
    icon: Icon,
    title,
}: Readonly<{ children: React.ReactNode; icon: typeof Languages; title: string }>) {
    return (
        <section className="setting-section">
            <div className="setting-icon">
                <Icon aria-hidden="true" size={21} />
            </div>
            <div className="setting-content">
                <h2>{title}</h2>
                {children}
            </div>
        </section>
    );
}

function OptionGroup({
    label,
    name,
    onChange,
    options,
    value,
}: Readonly<{
    label: string;
    name: string;
    onChange: (value: string) => void;
    options: ReadonlyArray<readonly [string, string]>;
    value: string;
}>) {
    return (
        <div aria-label={label} className="option-group" role="radiogroup">
            {options.map(([optionValue, optionLabel]) => (
                <label data-selected={value === optionValue} key={optionValue}>
                    <input
                        checked={value === optionValue}
                        name={name}
                        onChange={() => onChange(optionValue)}
                        type="radio"
                        value={optionValue}
                    />
                    <span>{optionLabel}</span>
                    {value === optionValue && <Check aria-hidden="true" size={16} />}
                </label>
            ))}
        </div>
    );
}

function applyTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
}
