"use client";

import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

import { formatDate, translate } from "@/core/i18n/translate";
import type { Locale, WeighIn } from "@/features/logbook/domain";
import { bodyMassIndex } from "@/features/profile/profile";
import { niceTicks, timeTicks } from "@/features/reports/chart-scale";
import {
    axisTick,
    ChartCard,
    ChartTooltip,
    gridStroke,
    type TooltipProps,
} from "@/features/reports/ui/trend-charts";

const DAY_MS = 86_400_000;
// WHO category boundaries, drawn as guides where they fall inside the axis.
const BMI_BOUNDARIES = [18.5, 25, 30];

/** BMI at every weigh-in, from the profile height. */
export function BmiChart({
    heightCm,
    locale,
    timeZone,
    weighIns,
}: Readonly<{
    heightCm: number | null;
    locale: Locale;
    timeZone: string;
    weighIns: readonly WeighIn[];
}>) {
    const title = translate(locale, "profile.bmiQuestion");
    if (!heightCm || weighIns.length === 0) {
        return (
            <ChartCard kind="weight" title={title}>
                <p className="muted">
                    {translate(locale, heightCm ? "reports.empty" : "profile.bmiNeedsHeight")}
                </p>
            </ChartCard>
        );
    }
    const data = weighIns.map((weighIn) => ({
        bmi: bodyMassIndex(weighIn.weightGrams, heightCm),
        recordedAt: weighIn.recordedAt,
        time: Date.parse(weighIn.recordedAt),
    }));
    const start = data[0]?.time ?? 0;
    const end = data.at(-1)?.time ?? 0;
    const domain = start === end ? [start - DAY_MS, end + DAY_MS] : [start, end];
    const values = data.map((point) => point.bmi);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const tickFormat = new Intl.DateTimeFormat(
        locale,
        end - start > 180 * DAY_MS
            ? { month: "short", timeZone, year: "2-digit" }
            : { day: "numeric", month: "short", timeZone },
    );

    return (
        <ChartCard kind="weight" title={title}>
            <div aria-label={title} className="chart-frame" role="img">
                <ResponsiveContainer>
                    <LineChart data={data} margin={{ bottom: 0, left: -4, right: 16, top: 16 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
                        <XAxis
                            axisLine={false}
                            dataKey="time"
                            domain={domain}
                            interval={0}
                            scale="time"
                            tick={axisTick}
                            tickFormatter={(time: number) => tickFormat.format(time)}
                            tickLine={false}
                            ticks={timeTicks(domain[0] ?? start, domain[1] ?? end)}
                            type="number"
                        />
                        <YAxis
                            axisLine={false}
                            domain={[ticks[0] ?? "auto", ticks.at(-1) ?? "auto"]}
                            ticks={ticks}
                            tick={axisTick}
                            tickFormatter={(value: number) => number.format(value)}
                            tickLine={false}
                            width={44}
                        />
                        {BMI_BOUNDARIES.map((boundary) => (
                            <ReferenceLine
                                key={boundary}
                                stroke="var(--text-muted)"
                                strokeDasharray="6 4"
                                y={boundary}
                            />
                        ))}
                        <Tooltip
                            content={({ active, payload }: TooltipProps) => {
                                const point = payload?.[0]?.payload;
                                return (
                                    <ChartTooltip
                                        active={Boolean(active)}
                                        heading={
                                            point
                                                ? formatDate(
                                                      String(point.recordedAt),
                                                      locale,
                                                      timeZone,
                                                  )
                                                : ""
                                        }
                                        value={
                                            typeof point?.bmi === "number"
                                                ? number.format(point.bmi)
                                                : null
                                        }
                                    />
                                );
                            }}
                            cursor={{ stroke: "var(--weight-ink)", strokeDasharray: "4 4" }}
                        />
                        <Line
                            isAnimationActive={false}
                            activeDot={{ r: 6 }}
                            dataKey="bmi"
                            dot={{ fill: "var(--surface)", r: 3.5, strokeWidth: 2 }}
                            stroke="var(--weight-ink)"
                            strokeWidth={3}
                            type="monotone"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </ChartCard>
    );
}
