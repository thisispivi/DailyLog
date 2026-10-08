const kindRows = [
    { color: "var(--kind-meal)", y: 236 },
    { color: "var(--kind-training)", y: 266 },
    { color: "var(--kind-sleep)", y: 296 },
    { color: "var(--kind-weight)", y: 326 },
] as const;

/**
 * The banner's robot in a tuxedo, holding the journal and the four-category
 * clipboard. Decorative only; colours come from CSS variables.
 */
export function RobotButler({ className }: Readonly<{ className?: string }>) {
    return (
        <svg aria-hidden="true" className={className} viewBox="0 0 360 380">
            <g stroke="var(--robot-outline)" strokeLinejoin="round" strokeWidth="4">
                {/* Body */}
                <path
                    d="M96 380 C96 262 128 200 180 196 C232 200 264 262 264 380 Z"
                    fill="#14306b"
                />
                <path d="M150 200 L180 300 L210 200 Z" fill="#f7f9fc" />
                <path
                    d="M180 212 L156 200 L156 226 Z M180 212 L204 200 L204 226 Z"
                    fill="#0b1530"
                />
                <circle cx="180" cy="212" fill="#0b1530" r="6" />
                <circle cx="180" cy="250" fill="#0b1530" r="3.5" strokeWidth="0" />
                <circle cx="180" cy="276" fill="#0b1530" r="3.5" strokeWidth="0" />

                {/* Head */}
                <line x1="180" x2="180" y1="30" y2="60" />
                <circle cx="180" cy="24" fill="var(--robot-shell)" r="10" />
                <rect
                    fill="var(--robot-shell-shade)"
                    height="54"
                    rx="10"
                    width="24"
                    x="92"
                    y="104"
                />
                <rect
                    fill="var(--robot-shell-shade)"
                    height="54"
                    rx="10"
                    width="24"
                    x="244"
                    y="104"
                />
                <rect fill="var(--robot-shell)" height="132" rx="50" width="150" x="105" y="58" />
                <rect fill="var(--robot-visor)" height="64" rx="32" width="112" x="124" y="90" />
                <rect
                    className="robot-eye"
                    fill="var(--robot-eye)"
                    height="34"
                    rx="9"
                    strokeWidth="0"
                    width="18"
                    x="150"
                    y="105"
                />
                <rect
                    className="robot-eye"
                    fill="var(--robot-eye)"
                    height="34"
                    rx="9"
                    strokeWidth="0"
                    width="18"
                    x="192"
                    y="105"
                />

                {/* Journal */}
                <g transform="rotate(-9 86 290)">
                    <rect fill="#1557c9" height="130" rx="12" width="96" x="38" y="226" />
                    <text
                        fill="#f7f9fc"
                        fontFamily="inherit"
                        fontSize="19"
                        fontWeight="800"
                        letterSpacing="1"
                        strokeWidth="0"
                    >
                        <tspan x="54" y="262">
                            DAILY
                        </tspan>
                        <tspan x="62" y="284">
                            LOG
                        </tspan>
                    </text>
                    <path
                        d="M58 306 H116 M58 320 H112 M58 334 H104"
                        stroke="#7fb2ff"
                        strokeWidth="3"
                    />
                </g>
                <circle cx="128" cy="318" fill="var(--robot-shell)" r="19" />

                {/* Clipboard */}
                <g transform="rotate(7 284 280)">
                    <rect fill="#f7f9fc" height="150" rx="14" width="104" x="232" y="204" />
                    <rect fill="#0b1d45" height="18" rx="6" width="46" x="261" y="194" />
                    {kindRows.map(({ color, y }) => (
                        <g key={y}>
                            <circle cx="258" cy={y} fill={color} r="11" strokeWidth="0" />
                            <path d={`M278 ${y} H318`} stroke="#8a97b3" strokeWidth="3" />
                        </g>
                    ))}
                </g>
                <circle cx="236" cy="330" fill="var(--robot-shell)" r="19" />
            </g>
        </svg>
    );
}
