"use client";

import { X } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

const PortalContainer = createContext<HTMLElement | null>(null);

/**
 * Where dropdowns and popovers should render. A modal <dialog> makes the rest of
 * the page inert, so inside a sheet they must portal into the dialog itself.
 */
export function usePortalContainer(): HTMLElement | null {
    return useContext(PortalContainer);
}

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
    const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);

    useEffect(() => {
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [dialog, open]);

    return (
        <dialog
            aria-labelledby="sheet-title"
            className="sheet"
            onClose={onClose}
            onClick={(event) => {
                // A click on the dialog element itself is a click on the backdrop.
                if (event.target === event.currentTarget) onClose();
            }}
            ref={setDialog}
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
            <div className="sheet-body">
                <PortalContainer.Provider value={dialog}>
                    {open && children}
                </PortalContainer.Provider>
            </div>
        </dialog>
    );
}
