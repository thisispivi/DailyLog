"use client";

import type { ReactNode } from "react";
import {
    Area,
    Bar,
    BarChart,
    CartesianGrid,
    ComposedChart,
    LabelList,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    type TooltipContentProps,
} from "recharts";

import { formatMinutes, formatWeight, translate } from "@/core/i18n/translate";
import type { ActivityTotal, DayTotals } from "@/features/insights/insights";
import { niceTicks } from "@/features/reports/chart-scale";
import { gramsToUnit, type Locale, type WeightUnit } from "@/features/logbook/domain";
import { KindIcon, type RecordKind } from "@/ui/kind-icon";

// Charts draw instantly: this is a dashboard you check, and animations replay on every visit.
const axisTick = { fill: "var(--text-muted)", fontSize: 12, fontWeight: 600 };
const gridStroke = "var(--line)";

// Day keys are plain calendar dates, so they are formatted in UTC to avoid shifting.
function formatDay(date: string, locale: Locale, style: "short" | "long" = "short"): string {
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: style === "short" ? "short" : "long",
        timeZone: "UTC",
        ...(style === "long" ? { weekday: "long" } : {}),
    }).format(new Date(`${date}T12:00:00Z`));
}

function ChartCard({
    aside,
    children,
    kind,
    title,
}: Readonly<{ aside?: ReactNode; children: ReactNode; kind: RecordKind; title: string }>) {
    return (
        <section className="card" data-kind={kind}>
            <header className="chart-heading">
                <KindIcon kind={kind} />
                <h2>{title}</h2>
                {aside && <span className="pill chart-aside numeric">{aside}</span>}
            </header>
            {children}
        </section>
    );
}

/** The shared tooltip: the day (or activity) on top, the formatted value below. */
function ChartTooltip({
    active,
    heading,
    value,
}: Readonly<{ active?: boolean; heading: string; value: string | null }>) {
    if (!active || value === null) return null;
    return (
        <div className="chart-tooltip">
            <span>{heading}</span>
            <strong>{value}</strong>
        </div>
    );
}

type TooltipProps = TooltipContentProps;

/** Hours of sleep per night, credited to the morning you woke up. */
export function SleepChart({
    days,
    locale,
}: Readonly<{ days: readonly DayTotals[]; locale: Locale }>) {
    const title = translate(locale, "reports.sleepQuestion");
    const data = days.map((day) => ({
        date: day.date,
        hours: day.sleepMinutes ? Math.round((day.sleepMinutes / 60) * 10) / 10 : null,
        minutes: day.sleepMinutes,
    }));
    const nights = data.filter((night) => night.hours !== null);
    const average = nights.length
        ? nights.reduce((sum, night) => sum + (night.hours ?? 0), 0) / nights.length
        : null;

    return (
        <ChartCard
            aside={
                average === null
                    ? null
                    : `${translate(locale, "reports.average")} ${formatMinutes(average * 60, locale)}`
            }
            kind="sleep"
            title={title}
        >
            {average === null ? (
                <p className="muted">{translate(locale, "reports.empty")}</p>
            ) : (
                <div aria-label={title} className="chart-frame" role="img">
                    <ResponsiveContainer>
                        <BarChart data={data} margin={{ bottom: 0, left: -12, right: 8, top: 16 }}>
                            <CartesianGrid
                                stroke={gridStroke}
                                strokeDasharray="4 4"
                                vertical={false}
                            />
                            <XAxis
                                axisLine={false}
                                dataKey="date"
                                minTickGap={12}
                                tick={axisTick}
                                tickFormatter={(date: string) => formatDay(date, locale)}
                                tickLine={false}
                            />
                            <YAxis
                                allowDecimals={false}
                                axisLine={false}
                                domain={[0, (max: number) => Math.max(10, Math.ceil(max))]}
                                tick={axisTick}
                                tickFormatter={(hours: number) => `${hours} h`}
                                tickLine={false}
                                width={48}
                            />
                            <Tooltip
                                content={({ active, payload }: TooltipProps) => {
                                    const night = payload?.[0]?.payload;
                                    return (
                                        <ChartTooltip
                                            active={Boolean(active)}
                                            heading={
                                                night
                                                    ? formatDay(String(night.date), locale, "long")
                                                    : ""
                                            }
                                            value={
                                                night?.minutes
                                                    ? formatMinutes(Number(night.minutes), locale)
                                                    : null
                                            }
                                        />
                                    );
                                }}
                                cursor={{ fill: "var(--surface-muted)", radius: 8 }}
                            />
                            <ReferenceLine
                                ifOverflow="extendDomain"
                                stroke="var(--sleep-ink)"
                                strokeDasharray="6 4"
                                y={average}
                            />
                            <Bar
                                isAnimationActive={false}
                                dataKey="hours"
                                fill="var(--sleep-ink)"
                                maxBarSize={28}
                                radius={[8, 8, 4, 4]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </ChartCard>
    );
}

/** Daily weight over the period, with the axis fitted to the actual range. */
export function WeightChart({
    days,
    locale,
    weightUnit,
}: Readonly<{ days: readonly DayTotals[]; locale: Locale; weightUnit: WeightUnit }>) {
    const title = translate(locale, "reports.weightQuestion");
    // Start at the first weigh-in so the line uses the full width.
    const firstRecorded = days.findIndex((day) => day.weightGrams !== null);
    const data = days.slice(Math.max(firstRecorded, 0)).map((day) => ({
        date: day.date,
        grams: day.weightGrams,
        weight:
            day.weightGrams === null
                ? null
                : Math.round(gramsToUnit(day.weightGrams, weightUnit) * 10) / 10,
    }));
    const recorded = data.filter((day) => day.weight !== null);
    const first = recorded[0];
    const last = recorded.at(-1);
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const values = recorded.map((day) => day.weight ?? 0);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));

    return (
        <ChartCard kind="weight" title={title}>
            {!first || !last ? (
                <p className="muted">{translate(locale, "reports.empty")}</p>
            ) : (
                <>
                    <div aria-label={title} className="chart-frame" role="img">
                        <ResponsiveContainer>
                            <ComposedChart
                                data={data}
                                margin={{ bottom: 0, left: -4, right: 8, top: 16 }}
                            >
                                <defs>
                                    <linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1">
                                        <stop
                                            offset="0%"
                                            stopColor="var(--weight-ink)"
                                            stopOpacity={0.25}
                                        />
                                        <stop
                                            offset="100%"
                                            stopColor="var(--weight-ink)"
                                            stopOpacity={0}
                                        />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid
                                    stroke={gridStroke}
                                    strokeDasharray="4 4"
                                    vertical={false}
                                />
                                <XAxis
                                    axisLine={false}
                                    dataKey="date"
                                    minTickGap={24}
                                    tick={axisTick}
                                    tickFormatter={(date: string) => formatDay(date, locale)}
                                    tickLine={false}
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
                                <Tooltip
                                    content={({ active, payload }: TooltipProps) => {
                                        const day = payload?.[0]?.payload;
                                        return (
                                            <ChartTooltip
                                                active={Boolean(active)}
                                                heading={
                                                    day
                                                        ? formatDay(
                                                              String(day.date),
                                                              locale,
                                                              "long",
                                                          )
                                                        : ""
                                                }
                                                value={
                                                    typeof day?.grams === "number"
                                                        ? formatWeight(
                                                              day.grams,
                                                              weightUnit,
                                                              locale,
                                                          )
                                                        : null
                                                }
                                            />
                                        );
                                    }}
                                    cursor={{ stroke: "var(--weight-ink)", strokeDasharray: "4 4" }}
                                />
                                <Area
                                    isAnimationActive={false}
                                    connectNulls
                                    dataKey="weight"
                                    fill="url(#weight-fill)"
                                    stroke="none"
                                    type="monotone"
                                />
                                <Line
                                    isAnimationActive={false}
                                    activeDot={{ r: 6 }}
                                    connectNulls
                                    dataKey="weight"
                                    dot={{ fill: "var(--surface)", r: 3.5, strokeWidth: 2 }}
                                    stroke="var(--weight-ink)"
                                    strokeWidth={3}
                                    type="monotone"
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="chart-endpoints numeric">
                        <span>{formatWeight(first.grams ?? 0, weightUnit, locale)}</span>
                        <strong>{formatWeight(last.grams ?? 0, weightUnit, locale)}</strong>
                    </div>
                </>
            )}
        </ChartCard>
    );
}

/** Training time per activity, as horizontal bars. */
export function TrainingChart({
    activities,
    locale,
}: Readonly<{ activities: readonly ActivityTotal[]; locale: Locale }>) {
    const title = translate(locale, "reports.activityQuestion");
    return (
        <ChartCard kind="training" title={title}>
            {activities.length === 0 ? (
                <p className="muted">{translate(locale, "reports.empty")}</p>
            ) : (
                <div
                    aria-label={title}
                    className="chart-frame"
                    role="img"
                    style={{ height: activities.length * 48 + 16 }}
                >
                    <ResponsiveContainer>
                        <BarChart
                            data={activities}
                            layout="vertical"
                            margin={{ bottom: 0, left: 0, right: 72, top: 0 }}
                        >
                            <XAxis hide type="number" />
                            <YAxis
                                axisLine={false}
                                dataKey="label"
                                tick={{ ...axisTick, fill: "var(--text)", fontSize: 14 }}
                                tickLine={false}
                                type="category"
                                width={110}
                            />
                            <Tooltip
                                content={({ active, label, payload }: TooltipProps) => (
                                    <ChartTooltip
                                        active={Boolean(active)}
                                        heading={String(label ?? "")}
                                        value={
                                            payload?.[0]
                                                ? formatMinutes(
                                                      Number(payload[0].payload.minutes),
                                                      locale,
                                                  )
                                                : null
                                        }
                                    />
                                )}
                                cursor={{ fill: "var(--surface-muted)", radius: 8 }}
                            />
                            <Bar
                                isAnimationActive={false}
                                barSize={14}
                                dataKey="minutes"
                                fill="var(--training-ink)"
                                radius={999}
                            >
                                <LabelList
                                    dataKey="minutes"
                                    fill="var(--text-muted)"
                                    fontSize={13}
                                    fontWeight={700}
                                    formatter={(minutes: unknown) =>
                                        formatMinutes(Number(minutes), locale)
                                    }
                                    position="right"
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </ChartCard>
    );
}
