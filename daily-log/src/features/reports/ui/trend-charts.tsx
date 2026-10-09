"use client";

import { Maximize2 } from "lucide-react";
import { type ReactNode, useState } from "react";
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

import { formatDate, formatMinutes, formatWeight, translate } from "@/core/i18n/translate";
import type { ActivityTotal, DayTotals } from "@/features/insights/insights";
import { niceTicks } from "@/features/reports/chart-scale";
import { gramsToUnit, type Locale, type WeighIn, type WeightUnit } from "@/features/logbook/domain";
import { KindIcon, type RecordKind } from "@/ui/kind-icon";
import { Sheet } from "@/ui/sheet";

// Charts draw instantly: this is a dashboard you check, and animations replay on every visit.
export const axisTick = { fill: "var(--text-muted)", fontSize: 12, fontWeight: 600 };
export const gridStroke = "var(--line)";

// Day keys are plain calendar dates, so they are formatted in UTC to avoid shifting.
function formatDay(date: string, locale: Locale, style: "short" | "long" = "short"): string {
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: style === "short" ? "short" : "long",
        timeZone: "UTC",
        ...(style === "long" ? { weekday: "long" } : {}),
    }).format(new Date(`${date}T12:00:00Z`));
}

export function ChartCard({
    action,
    aside,
    children,
    kind,
    title,
}: Readonly<{
    action?: ReactNode;
    aside?: ReactNode;
    children: ReactNode;
    kind: RecordKind;
    title: string;
}>) {
    return (
        <section className="card" data-kind={kind}>
            <header className="chart-heading">
                <KindIcon kind={kind} />
                <h2>{title}</h2>
                {aside && <span className="pill chart-aside numeric">{aside}</span>}
                {action}
            </header>
            {children}
        </section>
    );
}

/** The shared tooltip: the day (or activity) on top, the formatted value below. */
export function ChartTooltip({
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

export type TooltipProps = TooltipContentProps;

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

const DAY_MS = 86_400_000;

/** Every weigh-in ever recorded, on a time axis so uneven gaps keep their real width. */
export function WeightChart({
    locale,
    timeZone,
    weighIns,
    weightUnit,
}: Readonly<{
    locale: Locale;
    timeZone: string;
    weighIns: readonly WeighIn[];
    weightUnit: WeightUnit;
}>) {
    const [isExpanded, setIsExpanded] = useState(false);
    const title = translate(locale, "reports.weightQuestion");
    const first = weighIns[0];
    const last = weighIns.at(-1);
    const change = first && last ? last.weightGrams - first.weightGrams : 0;
    const sign = change > 0 ? "+" : change < 0 ? "−" : "±";

    return (
        <ChartCard
            action={
                first && (
                    <button
                        aria-label={translate(locale, "reports.expandChart")}
                        className="icon-button chart-expand"
                        onClick={() => setIsExpanded(true)}
                        type="button"
                    >
                        <Maximize2 aria-hidden="true" size={18} />
                    </button>
                )
            }
            kind="weight"
            title={title}
        >
            {!first || !last ? (
                <p className="muted">{translate(locale, "reports.empty")}</p>
            ) : (
                <>
                    <WeightPlot
                        label={title}
                        locale={locale}
                        timeZone={timeZone}
                        weighIns={weighIns}
                        weightUnit={weightUnit}
                    />
                    <div className="chart-endpoints numeric">
                        <span>
                            {first === last
                                ? null
                                : translate(locale, "reports.weightSince", {
                                      change: `${sign}${formatWeight(Math.abs(change), weightUnit, locale)}`,
                                      date: formatDate(first.recordedAt, locale, timeZone),
                                  })}
                        </span>
                        <strong>{formatWeight(last.weightGrams, weightUnit, locale)}</strong>
                    </div>
                    <Sheet
                        className="chart-sheet"
                        closeLabel={translate(locale, "common.close")}
                        onClose={() => setIsExpanded(false)}
                        open={isExpanded}
                        title={title}
                    >
                        <div data-kind="weight">
                            <WeightPlot
                                label={title}
                                locale={locale}
                                timeZone={timeZone}
                                weighIns={weighIns}
                                weightUnit={weightUnit}
                            />
                        </div>
                    </Sheet>
                </>
            )}
        </ChartCard>
    );
}

function WeightPlot({
    label,
    locale,
    timeZone,
    weighIns,
    weightUnit,
}: Readonly<{
    label: string;
    locale: Locale;
    timeZone: string;
    weighIns: readonly WeighIn[];
    weightUnit: WeightUnit;
}>) {
    const data = weighIns.map((weighIn) => ({
        grams: weighIn.weightGrams,
        recordedAt: weighIn.recordedAt,
        time: Date.parse(weighIn.recordedAt),
        weight: Math.round(gramsToUnit(weighIn.weightGrams, weightUnit) * 10) / 10,
    }));
    const start = data[0]?.time ?? 0;
    const end = data.at(-1)?.time ?? 0;
    // A lone weigh-in still needs a visible span around it.
    const domain = start === end ? [start - DAY_MS, end + DAY_MS] : [start, end];
    // Past half a year, day numbers stop helping; month and year read better.
    const tickFormat = new Intl.DateTimeFormat(
        locale,
        end - start > 180 * DAY_MS
            ? { month: "short", timeZone, year: "2-digit" }
            : { day: "numeric", month: "short", timeZone },
    );
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const values = data.map((point) => point.weight);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));

    return (
        <div aria-label={label} className="chart-frame" role="img">
            <ResponsiveContainer>
                <ComposedChart data={data} margin={{ bottom: 0, left: -4, right: 16, top: 16 }}>
                    <defs>
                        <linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="var(--weight-ink)" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="var(--weight-ink)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
                    <XAxis
                        axisLine={false}
                        dataKey="time"
                        domain={domain}
                        minTickGap={24}
                        scale="time"
                        tick={axisTick}
                        tickFormatter={(time: number) => tickFormat.format(time)}
                        tickLine={false}
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
                    <Tooltip
                        content={({ active, payload }: TooltipProps) => {
                            const point = payload?.[0]?.payload;
                            return (
                                <ChartTooltip
                                    active={Boolean(active)}
                                    heading={
                                        point
                                            ? formatDate(String(point.recordedAt), locale, timeZone)
                                            : ""
                                    }
                                    value={
                                        typeof point?.grams === "number"
                                            ? formatWeight(point.grams, weightUnit, locale)
                                            : null
                                    }
                                />
                            );
                        }}
                        cursor={{ stroke: "var(--weight-ink)", strokeDasharray: "4 4" }}
                    />
                    <Area
                        isAnimationActive={false}
                        dataKey="weight"
                        fill="url(#weight-fill)"
                        stroke="none"
                        type="monotone"
                    />
                    <Line
                        isAnimationActive={false}
                        activeDot={{ r: 6 }}
                        dataKey="weight"
                        dot={{ fill: "var(--surface)", r: 3.5, strokeWidth: 2 }}
                        stroke="var(--weight-ink)"
                        strokeWidth={3}
                        type="monotone"
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
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
