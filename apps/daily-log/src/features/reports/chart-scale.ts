/**
 * Round axis ticks that cover [min, max] with a little headroom, so a weight
 * axis reads 72, 73, 74 instead of Recharts' default 72.8, 73.5, 74.3.
 */
export function niceTicks(min: number, max: number): number[] {
    const steps = [0.5, 1, 2, 5, 10, 20, 50];
    const range = Math.max(max - min, 0.5);
    const step = steps.find((candidate) => range / candidate <= 5) ?? 100;
    const low = Math.floor((min - step / 2) / step) * step;
    const high = Math.ceil((max + step / 2) / step) * step;
    const ticks: number[] = [];
    for (let tick = low; tick <= high + step / 1000; tick += step) {
        ticks.push(Math.round(tick * 10) / 10);
    }
    return ticks;
}

const DAY_MS = 86_400_000;

/**
 * At most `count` evenly spaced, whole-day ticks across a time axis. Recharts
 * otherwise puts a tick on every point, and dense weigh-ins overlap into noise.
 */
export function timeTicks(start: number, end: number, count = 5): number[] {
    const step = Math.max(1, Math.ceil((end - start) / DAY_MS / (count - 1))) * DAY_MS;
    const ticks: number[] = [];
    for (let tick = start; tick <= end; tick += step) ticks.push(tick);
    return ticks;
}
