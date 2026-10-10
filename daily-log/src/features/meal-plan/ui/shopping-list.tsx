import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";
import { formatAmount, type ShoppingItem } from "@/features/meal-plan/meal-plan";

/** What the week's plan needs, added up per food. */
export function ShoppingList({
    items,
    locale,
}: Readonly<{ items: readonly ShoppingItem[]; locale: Locale }>) {
    const pieces = translate(locale, "mealPlan.pieces");
    return (
        <section aria-labelledby="shopping-title" className="card shopping-list">
            <div className="card-heading">
                <h2 id="shopping-title">{translate(locale, "mealPlan.shoppingTitle")}</h2>
            </div>
            <p className="muted">{translate(locale, "mealPlan.shoppingHint")}</p>
            <ul>
                {items.map((item) => (
                    <li key={`${item.food}|${item.unit ?? ""}`}>
                        <span>{item.food}</span>
                        <span className="numeric">
                            {item.amount === null
                                ? translate(locale, "mealPlan.times", { count: item.count })
                                : formatAmount(item.amount, item.unit, locale, pieces)}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
