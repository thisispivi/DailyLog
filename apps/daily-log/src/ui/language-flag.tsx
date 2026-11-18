import Image from "next/image";

import italy from "circle-flags/flags/it.svg";
import unitedKingdom from "circle-flags/flags/gb.svg";
import type { Locale } from "@/features/logbook/domain";

const flags = { en: unitedKingdom, it: italy } as const;

/** A round flag for a UI or report language. Decorative; the label names the language. */
export function LanguageFlag({ locale }: Readonly<{ locale: Locale }>) {
    return <Image alt="" className="flag" height={20} src={flags[locale]} unoptimized width={20} />;
}
