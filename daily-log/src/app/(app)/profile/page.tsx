import { getEnvironment } from "@/core/config/env";
import { formatWeight, translate } from "@/core/i18n/translate";
import { localizedTitle } from "@/core/preferences/preference-cookies";
import { localDateInZone } from "@/core/time/zoned-time";
import { ageOn, bmiCategory, bodyMassIndex, fullName } from "@/features/profile/profile";
import { BmiChart } from "@/features/profile/ui/bmi-chart";
import { ProfileForm } from "@/features/profile/ui/profile-form";
import { WeightChart } from "@/features/reports/ui/trend-charts";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

// The charts share their card, frame, and tooltip styles with Reports.
import "@/app/(app)/reports/reports.css";
import "./profile.css";

export const generateMetadata = () => localizedTitle("nav.profile");

export default function ProfilePage() {
    const { ownerId, timezone } = getEnvironment();
    const logbook = new LogbookRepository();
    const { locale, weightUnit } = logbook.getSettings(ownerId);
    const profile = logbook.getProfile(ownerId);
    const weighIns = logbook.listWeighIns(ownerId, { limit: null }).reverse();
    const latest = weighIns.at(-1);
    const bmi =
        latest && profile.heightCm ? bodyMassIndex(latest.weightGrams, profile.heightCm) : null;
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const stats = [
        {
            label: translate(locale, "profile.age"),
            value: profile.birthDate
                ? translate(locale, "profile.years", {
                      count: ageOn(profile.birthDate, localDateInZone(new Date(), timezone)),
                  })
                : "–",
        },
        {
            label: translate(locale, "profile.height"),
            value: profile.heightCm ? `${profile.heightCm} cm` : "–",
        },
        {
            label: translate(locale, "dashboard.weight"),
            value: latest ? formatWeight(latest.weightGrams, weightUnit, locale) : "–",
        },
    ];

    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">
                        {fullName(profile) || translate(locale, "app.tagline")}
                    </p>
                    <h1>{translate(locale, "profile.title")}</h1>
                </div>
            </header>
            <div className="profile-layout">
                <div className="reports-main">
                    <section aria-labelledby="profile-body-title" className="card">
                        <div className="card-heading">
                            <h2 id="profile-body-title">{translate(locale, "profile.body")}</h2>
                        </div>
                        <dl className="profile-stats">
                            {stats.map((stat) => (
                                <div className="profile-stat" key={stat.label}>
                                    <dt>{stat.label}</dt>
                                    <dd className="numeric">{stat.value}</dd>
                                </div>
                            ))}
                            <div className="profile-stat tile" data-kind="weight">
                                <dt>{translate(locale, "profile.bmi")}</dt>
                                <dd className="numeric">
                                    {bmi === null ? "–" : number.format(bmi)}
                                </dd>
                                {bmi !== null && (
                                    <span className="profile-bmi-category">
                                        {translate(locale, `profile.${bmiCategory(bmi)}`)}
                                    </span>
                                )}
                            </div>
                        </dl>
                    </section>
                    <div className="reports-charts">
                        <BmiChart
                            heightCm={profile.heightCm}
                            locale={locale}
                            timeZone={timezone}
                            weighIns={weighIns}
                        />
                        <WeightChart
                            locale={locale}
                            timeZone={timezone}
                            weighIns={weighIns}
                            weightUnit={weightUnit}
                        />
                    </div>
                </div>
                <ProfileForm initial={profile} locale={locale} timeZone={timezone} />
            </div>
        </>
    );
}
