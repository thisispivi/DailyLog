import { RobotMark } from "@/ui/robot-mark";

/** "Daily" in the surrounding text colour, "Log" in brand blue, as on the banner. */
export function Wordmark({ markSize = 32 }: Readonly<{ markSize?: number }>) {
    return (
        <span className="wordmark">
            <RobotMark size={markSize} />
            <span>
                Daily<span className="wordmark-accent">Log</span>
            </span>
        </span>
    );
}
