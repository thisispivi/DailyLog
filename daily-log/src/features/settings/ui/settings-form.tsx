"use client";

import {
    Check,
    DatabaseBackup,
    ExternalLink,
    FileText,
    Info,
    KeyRound,
    Languages,
    MonitorCog,
    Scale,
    type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";

import { APP_VERSION, AUTHOR_URL, REPOSITORY_URL } from "@/core/config/build-info";
import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import { ChangePasswordForm } from "@/features/auth/ui/change-password-form";
import { BackupControls } from "@/features/backup/ui/backup-controls";
import type { Locale, UserSettings } from "@/features/logbook/domain";
import { LanguageFlag } from "@/ui/language-flag";

type Status = { message: string; tone: "error" | "success" } | null;
type Preferences = Pick<UserSettings, "exportLocale" | "locale" | "theme" | "weightUnit">;

/** Every choice saves as soon as it is made; there is no separate save step. */
export function SettingsForm({ initial }: Readonly<{ initial: UserSettings }>) {
    const router = useRouter();
    const [settings, setSettings] = useState<Preferences>(initial);
    const [status, setStatus] = useState<Status>(null);
    const { locale } = settings;

    async function change<Key extends keyof Preferences>(key: Key, value: Preferences[Key]) {
        const previous = settings;
        setSettings({ ...settings, [key]: value });
        // Preview the theme immediately; the server writes the cookie on save.
        if (key === "theme") document.documentElement.dataset.theme = value;
        const { ok } = await sendJson("/api/settings", "PATCH", { [key]: value });
        if (!ok) {
            setSettings(previous);
            document.documentElement.dataset.theme = previous.theme;
        }
        // Confirm in the language the page is about to switch to.
        const messageLocale: Locale = ok && key === "locale" ? (value as Locale) : locale;
        setStatus({
            message: translate(messageLocale, ok ? "common.saved" : "common.error"),
            tone: ok ? "success" : "error",
        });
        if (ok) router.refresh();
    }

    const languages = (["en", "it"] as const).map((value) => ({
        icon: <LanguageFlag locale={value} />,
        label: translate(locale, value === "en" ? "settings.english" : "settings.italian"),
        value,
    }));

    return (
        <div className="settings-form">
            <p
                aria-live="polite"
                className="status-message settings-status"
                data-tone={status?.tone}
            >
                {status?.message}
            </p>
            <SettingSection
                hint={translate(locale, "settings.languageHint")}
                icon={Languages}
                title={translate(locale, "settings.interfaceLanguage")}
            >
                <OptionGroup
                    name="locale"
                    onChange={(value) => void change("locale", value)}
                    options={languages}
                    title={translate(locale, "settings.interfaceLanguage")}
                    value={settings.locale}
                />
            </SettingSection>
            <SettingSection icon={FileText} title={translate(locale, "settings.documentLanguage")}>
                <OptionGroup
                    name="exportLocale"
                    onChange={(value) => void change("exportLocale", value)}
                    options={languages}
                    title={translate(locale, "settings.documentLanguage")}
                    value={settings.exportLocale}
                />
            </SettingSection>
            <SettingSection
                hint={translate(locale, "settings.themeHint")}
                icon={MonitorCog}
                title={translate(locale, "settings.appearance")}
            >
                <OptionGroup
                    name="theme"
                    onChange={(value) => void change("theme", value)}
                    options={[
                        { label: translate(locale, "settings.system"), value: "system" },
                        { label: translate(locale, "settings.light"), value: "light" },
                        { label: translate(locale, "settings.dark"), value: "dark" },
                    ]}
                    title={translate(locale, "settings.appearance")}
                    value={settings.theme}
                />
            </SettingSection>
            <SettingSection icon={Scale} title={translate(locale, "settings.weightUnit")}>
                <OptionGroup
                    name="weightUnit"
                    onChange={(value) => void change("weightUnit", value)}
                    options={[
                        { label: translate(locale, "settings.kilograms"), value: "kg" },
                        { label: translate(locale, "settings.pounds"), value: "lb" },
                    ]}
                    title={translate(locale, "settings.weightUnit")}
                    value={settings.weightUnit}
                />
            </SettingSection>
            <SettingSection
                hint={translate(locale, "settings.backupHint")}
                icon={DatabaseBackup}
                title={translate(locale, "settings.backup")}
            >
                <BackupControls locale={locale} />
            </SettingSection>
            <SettingSection
                hint={translate(locale, "settings.passwordHint")}
                icon={KeyRound}
                title={translate(locale, "settings.changePassword")}
            >
                <ChangePasswordForm locale={locale} />
            </SettingSection>
            <SettingSection icon={Info} title={translate(locale, "about.title")}>
                <p className="muted numeric">
                    {translate(locale, "about.version", { version: APP_VERSION })}
                </p>
                <div className="about-links">
                    <a
                        className="chip"
                        href={REPOSITORY_URL}
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        {translate(locale, "about.repository")}
                        <ExternalLink aria-hidden="true" size={14} />
                    </a>
                    <a className="chip" href={AUTHOR_URL} rel="noopener noreferrer" target="_blank">
                        {translate(locale, "about.website")}
                        <ExternalLink aria-hidden="true" size={14} />
                    </a>
                </div>
            </SettingSection>
        </div>
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
    options: ReadonlyArray<{ icon?: ReactNode; label: string; value: Value }>;
    title: string;
    value: Value;
}>) {
    return (
        <div aria-label={title} className="option-group" role="radiogroup">
            {options.map((option) => (
                <label className="chip" key={option.value}>
                    <input
                        checked={value === option.value}
                        name={name}
                        onChange={() => onChange(option.value)}
                        type="radio"
                        value={option.value}
                    />
                    {option.icon}
                    <span>{option.label}</span>
                    <Check aria-hidden="true" className="option-check" size={16} />
                </label>
            ))}
        </div>
    );
}
