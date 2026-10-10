import { Suspense } from "react";

import { DemoApp } from "@demo/shell/demo-app";

const views = [
    "calendar",
    "history",
    "login",
    "meal-plan",
    "profile",
    "reports",
    "settings",
    "today",
] as const;

export const dynamicParams = false;

export function generateStaticParams(): Array<{ view: string }> {
    return views.map((view) => ({ view }));
}

export default async function DemoPage({
    params,
}: Readonly<{ params: Promise<{ view: string }> }>) {
    const { view } = await params;
    // useSearchParams needs a Suspense boundary in a static export.
    return (
        <Suspense>
            <DemoApp view={view} />
        </Suspense>
    );
}
