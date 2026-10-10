import { Target } from "lucide-react";

import { formatDate, formatWeight, translate } from "@/core/i18n/translate";
import type { Locale, WeightUnit } from "@/features/logbook/domain";
import type { WeightGoal, WeightGoalProgress } from "@/features/profile/profile";

/** Progress towards the goal weight, with the recent pace and what the goal date needs. */
export function WeightGoalCard({
    goal,
    locale,
    progress,
    timeZone,
    weightUnit,
}: Readonly<{
    goal: WeightGoal | null;
    locale: Locale;
    progress: WeightGoalProgress | null;
    timeZone: string;
    weightUnit: WeightUnit;
}>) {
    const weight = (grams: number) => formatWeight(grams, weightUnit, locale);
    const signed = (grams: number) =>
        `${grams > 0 ? "+" : grams < 0 ? "−" : "±"}${weight(Math.abs(Math.round(grams)))}`;
    const perWeek = (grams: number) =>
        translate(locale, "profile.perWeek", { weight: signed(grams) });

    return (
        <section
            aria-labelledby="weight-goal-title"
            className="card weight-goal"
            data-kind="weight"
        >
            <div className="card-heading">
                <h2 id="weight-goal-title">
                    <Target aria-hidden="true" size={20} />
                    {translate(locale, "profile.weightGoal")}
                </h2>
                {progress?.reached && (
                    <span className="pill">{translate(locale, "profile.goalReached")}</span>
                )}
            </div>
            {!goal || !progress ? (
                <p className="muted">
                    {translate(locale, goal ? "profile.goalNeedsWeighIn" : "profile.goalNone")}
                </p>
            ) : (
                <>
                    <div
                        aria-label={translate(locale, "profile.weightGoal")}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={Math.round(progress.progress * 100)}
                        className="goal-bar"
                        role="progressbar"
                    >
                        <span style={{ width: `${progress.progress * 100}%` }} />
                    </div>
                    <p className="muted numeric">
                        {translate(locale, "profile.goalProgress", {
                            percent: new Intl.NumberFormat(locale, { style: "percent" }).format(
                                progress.progress,
                            ),
                        })}
                    </p>
                    <dl className="profile-stats">
                        {[
                            ["profile.goalStart", weight(progress.startGrams)],
                            ["profile.goalCurrent", weight(progress.currentGrams)],
                            ["profile.goalTarget", weight(progress.targetGrams)],
                            [
                                "profile.goalRemaining",
                                progress.reached ? "–" : signed(progress.remainingGrams),
                            ],
                        ].map(([key, value]) => (
                            <div className="profile-stat" key={key}>
                                <dt>{translate(locale, key as Parameters<typeof translate>[1])}</dt>
                                <dd className="numeric">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    {!progress.reached && (
                        <dl className="goal-details">
                            <div>
                                <dt>{translate(locale, "profile.goalPace")}</dt>
                                <dd className="numeric">
                                    {progress.weeklyPaceGrams === null
                                        ? translate(locale, "profile.goalPaceUnknown")
                                        : perWeek(progress.weeklyPaceGrams)}
                                </dd>
                            </div>
                            {progress.weeklyPaceGrams !== null && (
                                <div>
                                    <dt>{translate(locale, "profile.goalEstimate")}</dt>
                                    <dd className="numeric">
                                        {progress.estimatedAt === null
                                            ? translate(locale, "profile.goalNotReachable")
                                            : formatDate(
                                                  new Date(progress.estimatedAt),
                                                  locale,
                                                  timeZone,
                                              )}
                                    </dd>
                                </div>
                            )}
                            {goal.date && progress.neededWeeklyGrams !== null && (
                                <div>
                                    <dt>
                                        {translate(locale, "profile.goalNeeded", {
                                            date: formatDate(goal.date, locale, "UTC"),
                                        })}
                                    </dt>
                                    <dd className="numeric">
                                        {perWeek(progress.neededWeeklyGrams)}
                                    </dd>
                                </div>
                            )}
                        </dl>
                    )}
                </>
            )}
        </section>
    );
}
