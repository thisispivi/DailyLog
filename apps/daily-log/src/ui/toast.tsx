"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";

type Toast = { id: number; message: string; tone: "error" | "success" };

const TOAST_EVENT = "dailylog:toast";
// globals.css times the toast exit animation to end at this point.
const TOAST_MS = 4000;

/**
 * Confirms an action whose result is not visible where it happened, such as a
 * sheet that closes or a row that leaves the list. Errors stay inline next to
 * the control that caused them; a toast only repeats them when that control is gone.
 */
export function showToast(message: string, tone: Toast["tone"] = "success"): void {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, tone } }));
}

/** Renders the toasts from `showToast`; mount it once per page shell. */
export function Toaster() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        let nextId = 0;
        function onToast(event: Event) {
            const { message, tone } = (event as CustomEvent<Omit<Toast, "id">>).detail;
            const id = (nextId += 1);
            setToasts((current) => [...current, { id, message, tone }]);
            window.setTimeout(
                () => setToasts((current) => current.filter((toast) => toast.id !== id)),
                TOAST_MS,
            );
        }
        window.addEventListener(TOAST_EVENT, onToast);
        return () => window.removeEventListener(TOAST_EVENT, onToast);
    }, []);

    // The live region stays mounted so screen readers announce each new toast.
    return (
        <div aria-live="polite" className="toaster" role="status">
            {toasts.map(({ id, message, tone }) => (
                <p className="toast" data-tone={tone} key={id}>
                    {tone === "error" ? (
                        <CircleAlert aria-hidden="true" size={18} />
                    ) : (
                        <CircleCheck aria-hidden="true" size={18} />
                    )}
                    {message}
                </p>
            ))}
        </div>
    );
}
