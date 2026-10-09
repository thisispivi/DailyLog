import type { RecordKind } from "@/ui/kind-icon";

/**
 * The light "morning" palette from globals.css, as literal hex values for files
 * that cannot read CSS variables (XLSX and PDF). Keep both in sync.
 */
export const palette = {
    canvas: "#F4F1FF",
    line: "#E3DEF7",
    muted: "#6E6A8F",
    primary: "#6A5AE0",
    primarySoft: "#E9E5FF",
    stripe: "#FAF9FF",
    surface: "#FFFFFF",
    text: "#2E2A4F",
} as const;

export const kindColors: Readonly<Record<RecordKind, { ink: string; tile: string }>> = {
    meal: { ink: "#1E7A4C", tile: "#D7F5E3" },
    sleep: { ink: "#2F4FB0", tile: "#DCE6FF" },
    training: { ink: "#A8530F", tile: "#FFE3CC" },
    weight: { ink: "#6A3DB0", tile: "#EDDCFF" },
};
