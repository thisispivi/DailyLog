import { Footprints, Moon, Scale, Utensils, type LucideIcon } from "lucide-react";

import type { EntryKind } from "@/features/logbook/domain";

/** Every record type, including weigh-ins, which are stored separately from entries. */
export type RecordKind = EntryKind | "weight";

// The colours come from the clipboard on the banner: green meals, orange
// training, blue sleep, purple weight. Keep them in sync with globals.css.
const icons: Readonly<Record<RecordKind, LucideIcon>> = {
    meal: Utensils,
    sleep: Moon,
    training: Footprints,
    weight: Scale,
};

export function KindIcon({ kind, size = 18 }: Readonly<{ kind: RecordKind; size?: number }>) {
    const Icon = icons[kind];
    return <Icon aria-hidden="true" size={size} strokeWidth={2} />;
}

/** A filled circular badge in the record type's colour. */
export function KindBadge({
    kind,
    size = "medium",
}: Readonly<{ kind: RecordKind; size?: "small" | "medium" | "large" }>) {
    const iconSize = { large: 22, medium: 18, small: 14 }[size];
    return (
        <span className="kind-badge" data-kind={kind} data-size={size}>
            <KindIcon kind={kind} size={iconSize} />
        </span>
    );
}
