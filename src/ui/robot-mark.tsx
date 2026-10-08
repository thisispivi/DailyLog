/** The DailyLog robot's head, drawn in SVG so it stays crisp at any size and in both themes. */
export function RobotMark({
    size = 32,
    className,
}: Readonly<{ size?: number; className?: string }>) {
    return (
        <svg
            aria-hidden="true"
            className={className}
            height={size}
            viewBox="0 0 64 64"
            width={size}
        >
            <line stroke="var(--robot-shell-edge)" strokeWidth="3" x1="32" x2="32" y1="6" y2="13" />
            <circle
                cx="32"
                cy="5"
                fill="var(--robot-shell)"
                r="3.5"
                stroke="var(--robot-shell-edge)"
                strokeWidth="1.5"
            />
            <rect fill="var(--robot-shell-shade)" height="16" rx="3" width="7" x="4" y="27" />
            <rect fill="var(--robot-shell-shade)" height="16" rx="3" width="7" x="53" y="27" />
            <rect
                fill="var(--robot-shell)"
                height="44"
                rx="17"
                stroke="var(--robot-shell-edge)"
                strokeWidth="2"
                width="46"
                x="9"
                y="13"
            />
            <rect fill="var(--robot-visor)" height="21" rx="10.5" width="34" x="15" y="23" />
            <rect
                className="robot-eye"
                fill="var(--robot-eye)"
                height="11"
                rx="3"
                width="6"
                x="22"
                y="28"
            />
            <rect
                className="robot-eye"
                fill="var(--robot-eye)"
                height="11"
                rx="3"
                width="6"
                x="36"
                y="28"
            />
        </svg>
    );
}
