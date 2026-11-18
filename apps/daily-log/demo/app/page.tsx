import { Suspense } from "react";

import { DemoApp } from "@demo/shell/demo-app";

/** The demo opens on Today, like the app after signing in. */
export default function DemoHome() {
    return (
        <Suspense>
            <DemoApp view="today" />
        </Suspense>
    );
}
