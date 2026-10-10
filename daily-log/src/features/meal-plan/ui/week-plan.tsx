"use client";

import { RefreshCw, Shuffle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import { shiftDate } from "@/core/time/zoned-time";
import type { Locale } from "@/features/logbook/domain";
import { formatAmount } from "@/features/meal-plan/meal-plan";
import type {
    Diet,
    DietOption,
    MealKey,
    MealPlan,
    PlannedMeal,
} from "@/features/meal-plan/schemas";

type Status = { message: string; tone: "error" | "success" } | null;

/** The week's meals, one card per day, with a new roll for a meal or the whole week. */
export function WeekPlan({
    diet,
    locale,
    plan,
    today,
}: Readonly<{ diet: Diet | null; locale: Locale; plan: MealPlan | null; today: string }>) {
    const router = useRouter();
    const [pending, setPending] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>(null);
    const dayName = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
        weekday: "long",
    });

    async function send(key: string, path: string, body: object) {
        setPending(key);
        const { ok } = await sendJson(path, "POST", body);
        setPending(null);
        setStatus({
            message: translate(locale, ok ? "mealPlan.updated" : "common.error"),
            tone: ok ? "success" : "error",
        });
        if (ok) router.refresh();
    }

    function newWeek() {
        if (plan && !window.confirm(translate(locale, "mealPlan.newWeekConfirm"))) return;
        void send("week", "/api/meal-plan", {});
    }

    if (!diet) {
        return (
            <section className="card empty-state">
                <p>{translate(locale, "mealPlan.noDiet")}</p>
            </section>
        );
    }

    const weekButton = (
        <button
            aria-busy={pending === "week"}
            className={plan ? "button button-ghost" : "button button-primary"}
            disabled={pending !== null}
            onClick={newWeek}
            type="button"
        >
            <Shuffle aria-hidden="true" size={18} />
            {translate(
                locale,
                pending === "week"
                    ? "mealPlan.generating"
                    : plan
                      ? "mealPlan.newWeek"
                      : "mealPlan.generateWeek",
            )}
        </button>
    );

    return (
        <div className="week-plan">
            <div className="week-plan-toolbar">
                <p aria-live="polite" className="status-message" data-tone={status?.tone}>
                    {status?.message}
                </p>
                {weekButton}
            </div>
            {!plan ? (
                <section className="card empty-state">
                    <p>{translate(locale, "mealPlan.noPlan")}</p>
                </section>
            ) : (
                <ol className="meal-days">
                    {plan.days.map((day, index) => {
                        const date = shiftDate(plan.startDate, index);
                        const label = dayName.format(new Date(`${date}T00:00:00Z`));
                        return (
                            <li
                                aria-current={date === today ? "date" : undefined}
                                className="card meal-day"
                                key={date}
                            >
                                <div className="meal-day-heading">
                                    <h2>{label}</h2>
                                    {date === today && (
                                        <span className="pill">
                                            {translate(locale, "mealPlan.today")}
                                        </span>
                                    )}
                                </div>
                                <ul className="meal-rows">
                                    {day.meals.map((meal) => (
                                        <MealRow
                                            busy={pending === `${index}-${meal.key}`}
                                            dayLabel={label}
                                            diet={diet}
                                            disabled={pending !== null}
                                            key={meal.key}
                                            locale={locale}
                                            meal={meal}
                                            onReroll={() =>
                                                void send(
                                                    `${index}-${meal.key}`,
                                                    "/api/meal-plan/reroll",
                                                    { day: index, meal: meal.key },
                                                )
                                            }
                                        />
                                    ))}
                                </ul>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}

/** "200 ml" for a single food named like its option, otherwise "Oats 40 g · Milk 200 ml". */
function describeItems(option: DietOption, locale: Locale, pieces: string): string {
    const amount = (item: DietOption["items"][number]) =>
        item.amount === undefined
            ? ""
            : formatAmount(item.amount, item.unit ?? null, locale, pieces);
    const [only] = option.items;
    if (option.items.length === 1 && only && only.food === option.name) return amount(only);
    return option.items.map((item) => `${item.food} ${amount(item)}`.trim()).join(" · ");
}

function mealName(locale: Locale, key: MealKey): string {
    return translate(locale, `entry.${key}`);
}

function MealRow({
    busy,
    dayLabel,
    diet,
    disabled,
    locale,
    meal,
    onReroll,
}: Readonly<{
    busy: boolean;
    dayLabel: string;
    diet: Diet;
    disabled: boolean;
    locale: Locale;
    meal: PlannedMeal;
    onReroll: () => void;
}>) {
    const variants = diet.meals.find((candidate) => candidate.key === meal.key)?.variants ?? [];
    const variant = variants.find((candidate) => candidate.id === meal.variantId);
    const options = new Map(diet.options.map((option) => [option.id, option]));
    const pieces = translate(locale, "mealPlan.pieces");
    const name = mealName(locale, meal.key);

    return (
        <li className="meal-row" data-kind="meal">
            <div className="meal-row-heading">
                <h3>
                    {name}
                    {/* The variant only says something when the meal has alternatives. */}
                    {variant && variants.length > 1 && (
                        <span className="muted"> · {variant.name}</span>
                    )}
                </h3>
                <button
                    aria-busy={busy}
                    aria-label={translate(locale, "mealPlan.reroll", {
                        day: dayLabel,
                        meal: name.toLowerCase(),
                    })}
                    className="icon-button"
                    disabled={disabled}
                    onClick={onReroll}
                    type="button"
                >
                    <RefreshCw aria-hidden="true" size={16} />
                </button>
            </div>
            {!variant ? (
                <p className="muted">{translate(locale, "mealPlan.noFit")}</p>
            ) : (
                meal.picks.length > 0 && (
                    <ul className="meal-picks">
                        {meal.picks.map((pick) => {
                            const option = pick.optionId ? options.get(pick.optionId) : undefined;
                            return (
                                <li key={pick.slot}>
                                    {option ? (
                                        <>
                                            <strong>{option.name}</strong>
                                            <span className="muted">
                                                {describeItems(option, locale, pieces)}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="muted">
                                            {pick.slot}: {translate(locale, "mealPlan.noFit")}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )
            )}
        </li>
    );
}
