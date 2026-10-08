"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * A modal sheet on the native <dialog>, which gives focus trapping, Escape to
 * close, and focus return for free. It slides up from the bottom on phones.
 */
export function Sheet({
    children,
    closeLabel,
    onClose,
    open,
    title,
}: Readonly<{
    children: ReactNode;
    closeLabel: string;
    onClose: () => void;
    open: boolean;
    title: string;
}>) {
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const element = dialog.current;
        if (!element) return;
        if (open && !element.open) element.showModal();
        if (!open && element.open) element.close();
    }, [open]);

    return (
        <dialog
            aria-labelledby="sheet-title"
            className="sheet"
            onClose={onClose}
            onClick={(event) => {
                // A click on the dialog element itself is a click on the backdrop.
                if (event.target === event.currentTarget) onClose();
            }}
            ref={dialog}
        >
            <div className="sheet-header">
                <h2 id="sheet-title">{title}</h2>
                <button
                    aria-label={closeLabel}
                    className="icon-button"
                    onClick={onClose}
                    type="button"
                >
                    <X aria-hidden="true" size={20} />
                </button>
            </div>
            <div className="sheet-body">{open && children}</div>
        </dialog>
    );
}
