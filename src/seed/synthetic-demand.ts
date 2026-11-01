import type { HourlyDemand } from '../demand/model.ts';
import { addDays, weekdayOf } from '../shared/clock.ts';

/**
 * SYNTHETIC demand generator for demonstrations and tests.
 *
 * The numbers come from hand-written assumptions (below), NOT from any real
 * university. They exist so the forecasting pipeline can be demonstrated and
 * tested end to end. Any accuracy measured on them only shows that the
 * pipeline works; it says nothing about real-world performance.
 *
 * Assumptions: Monday–Friday teaching week (UAE weekend is Saturday–Sunday),
 * peaks before morning classes, at lunch and late afternoon, lower demand on
 * Friday afternoons, a slight upward drift through the semester, Poisson noise.
 */
const HOUR_PROFILE: Record<number, number> = {
  7: 3.5, 8: 12, 9: 8, 10: 5.5, 11: 6, 12: 8.5, 13: 8, 14: 5.5, 15: 6.5, 16: 10, 17: 11, 18: 6, 19: 3.5, 20: 2.5, 21: 1.5,
};

function dayFactor(weekday: number, hour: number): number {
  if (weekday === 6) return 0.2; // Saturday
  if (weekday === 0) return 0.25; // Sunday
  if (weekday === 5) return hour >= 12 ? 0.35 : 0.8; // Friday
  return 1;
}

/** Deterministic PRNG (mulberry32) so every run produces the same demo data. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, random: () => number): number {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= random();
  } while (p > limit);
  return k - 1;
}

export interface SyntheticDemandOptions {
  /** Last date generated (inclusive), local time. */
  endDate: string;
  days: number;
  stopWeights: Record<string, number>;
  serviceHours: { first: number; last: number };
  seed?: number;
}

export function generateSyntheticDemand(options: SyntheticDemandOptions): HourlyDemand[] {
  const random = mulberry32(options.seed ?? 305);
  const rows: HourlyDemand[] = [];
  const startDate = addDays(options.endDate, -(options.days - 1));
  for (let d = 0; d < options.days; d++) {
    const date = addDays(startDate, d);
    const weekday = weekdayOf(date);
    const drift = 1 + 0.01 * Math.floor(d / 7);
    for (const [stopId, weight] of Object.entries(options.stopWeights)) {
      for (let hour = options.serviceHours.first; hour <= options.serviceHours.last; hour++) {
        const lambda = (HOUR_PROFILE[hour] ?? 1) * weight * dayFactor(weekday, hour) * drift;
        const count = poisson(lambda, random);
        if (count > 0) rows.push({ stopId, date, hour, count, source: 'synthetic' });
      }
    }
  }
  return rows;
}
