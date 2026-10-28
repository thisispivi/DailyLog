"use client";

import { NotebookPen } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { sendJson } from "@/core/http/client";
import { translate } from "@/core/i18n/translate";
import { DAY_NOTE_MAX_LENGTH, type Locale } from "@/features/logbook/domain";

import "./day-note.css";

const AUTOSAVE_DELAY_MS = 800;

type Status = "idle" | "saving" | "saved" | "error";

/** Free notes for one day. Saves on its own shortly after typing stops. */
export function DayNote({
    day,
    initialText,
    locale,
}: Readonly<{ day: string; initialText: string; locale: Locale }>) {
    const [text, setText] = useState(initialText);
    const [status, setStatus] = useState<Status>("idle");
    const savedText = useRef(initialText);
    const latestText = useRef(initialText);
    const isSaving = useRef(false);

    useEffect(() => {
        latestText.current = text;
        if (text === savedText.current) return;
        // One save at a time, so a slow earlier request can't overwrite newer text;
        // whatever was typed meanwhile is sent when it finishes.
        const save = async (): Promise<void> => {
            const sending = latestText.current;
            if (isSaving.current || sending === savedText.current) return;
            isSaving.current = true;
            setStatus("saving");
            const { ok } = await sendJson(`/api/notes/${day}`, "PUT", { text: sending });
            isSaving.current = false;
            if (!ok) {
                setStatus("error");
                return;
            }
            savedText.current = sending;
            if (latestText.current === sending) setStatus("saved");
            else void save();
        };
        const timer = window.setTimeout(save, AUTOSAVE_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [day, text]);

    // Switching day or page unmounts the note and cancels the timer above, so send
    // what is still unsaved with a request that outlives the component.
    useEffect(
        () => () => {
            if (latestText.current === savedText.current) return;
            void sendJson(
                `/api/notes/${day}`,
                "PUT",
                { text: latestText.current },
                { keepalive: true },
            );
        },
        [day],
    );

    const statusText = {
        error: translate(locale, "common.error"),
        idle: "",
        saved: translate(locale, "common.saved"),
        saving: translate(locale, "notes.saving"),
    }[status];

    return (
        <section aria-labelledby={`note-title-${day}`} className="card day-note">
            <div className="card-heading">
                <h2 id={`note-title-${day}`}>
                    <NotebookPen aria-hidden="true" size={20} />
                    {translate(locale, "notes.title")}
                </h2>
                <p
                    aria-live="polite"
                    className="status-message"
                    data-tone={
                        status === "error" ? "error" : status === "saved" ? "success" : undefined
                    }
                >
                    {statusText}
                </p>
            </div>
            <label className="sr-only" htmlFor={`note-${day}`}>
                {translate(locale, "notes.title")}
            </label>
            <textarea
                className="textarea day-note-text"
                id={`note-${day}`}
                maxLength={DAY_NOTE_MAX_LENGTH}
                onChange={(event) => setText(event.currentTarget.value)}
                placeholder={translate(locale, "notes.placeholder")}
                value={text}
            />
        </section>
    );
}
