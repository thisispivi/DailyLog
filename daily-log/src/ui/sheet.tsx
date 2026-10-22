"use client";

import { X } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useId, useState } from "react";

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
 * Closing plays the exit animation before the dialog closes, keeping the content
 * on screen until then.
 */
export function Sheet({
    children,
    className,
    closeLabel,
    onClose,
    open,
    title,
}: Readonly<{
    children: ReactNode;
    className?: string;
    closeLabel: string;
    onClose: () => void;
    open: boolean;
    title: string;
}>) {
    const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
    const [isRendered, setIsRendered] = useState(open);
    const titleId = useId();
    // Adjusting state while rendering: the content mounts with the opening render.
    if (open && !isRendered) setIsRendered(true);

    useEffect(() => {
        if (!dialog) return;
        if (open) {
            if (!dialog.open) dialog.showModal();
            return;
        }
        if (!dialog.open) return;
        let isCancelled = false;
        dialog.toggleAttribute("data-closing", true);
        // Under reduced motion there are no animations, so this closes at once.
        void Promise.allSettled(dialog.getAnimations().map((animation) => animation.finished)).then(
            () => {
                if (isCancelled) return;
                dialog.toggleAttribute("data-closing", false);
                dialog.close();
            },
        );
        return () => {
            // Reopened before the exit finished: drop the exit and stay open.
            isCancelled = true;
            dialog.toggleAttribute("data-closing", false);
        };
    }, [dialog, open]);

    return (
        <dialog
            aria-labelledby={titleId}
            className={className ? `sheet ${className}` : "sheet"}
            onCancel={(event) => {
                // Escape asks the owner to close, so it animates like the other ways out.
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                // A click on the dialog element itself is a click on the backdrop.
                if (event.target === event.currentTarget) onClose();
            }}
            onClose={() => {
                setIsRendered(false);
                onClose();
            }}
            ref={setDialog}
        >
            <div className="sheet-header">
                <h2 id={titleId}>{title}</h2>
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
                    {isRendered && children}
                </PortalContainer.Provider>
            </div>
        </dialog>
    );
}
