import { Activity } from "lucide-react";

/** The app mark (a pulse line in a violet square) followed by the product name. */
export function Logo() {
    return (
        <span className="logo">
            <span aria-hidden="true" className="logo-mark">
                <Activity size={18} strokeWidth={2.5} />
            </span>
            <span className="logo-name">DailyLog</span>
        </span>
    );
}
