import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { localizedTitle } from "@/core/preferences/preference-cookies";
import { localDateInZone } from "@/core/time/zoned-time";
import { shoppingList } from "@/features/meal-plan/meal-plan";
import { DietSetup } from "@/features/meal-plan/ui/diet-setup";
import { ShoppingList } from "@/features/meal-plan/ui/shopping-list";
import { WeekPlan } from "@/features/meal-plan/ui/week-plan";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import "./meal-plan.css";

export const generateMetadata = () => localizedTitle("nav.mealPlan");

export default function MealPlanPage() {
    const { ownerId, timezone } = getEnvironment();
    const logbook = new LogbookRepository();
    const { locale } = logbook.getSettings(ownerId);
    const diet = logbook.getDiet(ownerId);
    const plan = diet ? logbook.getMealPlan(ownerId) : null;

    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">
                        {diet?.name ?? translate(locale, "mealPlan.subtitle")}
                    </p>
                    <h1>{translate(locale, "mealPlan.title")}</h1>
                </div>
            </header>
            <div className="meal-plan-layout">
                <WeekPlan
                    diet={diet}
                    locale={locale}
                    plan={plan}
                    today={localDateInZone(new Date(), timezone)}
                />
                <div className="meal-plan-side">
                    <DietSetup diet={diet} locale={locale} />
                    {diet && plan && (
                        <ShoppingList items={shoppingList(diet, plan)} locale={locale} />
                    )}
                </div>
            </div>
        </>
    );
}
