import { Footprints, Moon, Scale, Utensils, type LucideIcon } from "lucide-react";

import type { EntryKind } from "@/features/logbook/domain";

/** Every record type, including weigh-ins, which are stored separately from entries. */
export type RecordKind = EntryKind | "weight";

export const recordKinds: readonly RecordKind[] = ["meal", "training", "sleep", "weight"];

const icons: Readonly<Record<RecordKind, LucideIcon>> = {
    meal: Utensils,
    sleep: Moon,
    training: Footprints,
    weight: Scale,
};

const iconSizes = { large: 24, medium: 20, small: 16 } as const;

/** The record type's icon on its pastel tile. Colours come from `[data-kind]` in globals.css. */
export function KindIcon({
    kind,
    size = "medium",
}: Readonly<{ kind: RecordKind; size?: keyof typeof iconSizes }>) {
    const Icon = icons[kind];
    return (
        <span className="kind-icon" data-kind={kind} data-size={size}>
            <Icon aria-hidden="true" size={iconSizes[size]} strokeWidth={2.2} />
        </span>
    );
}
