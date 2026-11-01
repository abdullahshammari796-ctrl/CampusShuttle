/**
 * Clock port. Every time-dependent rule (staleness, expiry, ETA) reads time
 * through this interface so tests can control time deterministically.
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** Test/demo clock that only moves when told to. */
export class ManualClock implements Clock {
  private current: number;

  constructor(start: number = Date.UTC(2026, 9, 5, 5, 0, 0)) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }

  set(ms: number): void {
    this.current = ms;
  }
}

/**
 * Campus-local calendar helpers. Demand is analysed in campus local time
 * (UAE, UTC+4, no daylight saving), not in UTC.
 */
export function localDateHour(ms: number, offsetMinutes: number): { date: string; hour: number; weekday: number } {
  const local = new Date(ms + offsetMinutes * 60_000);
  return {
    date: local.toISOString().slice(0, 10),
    hour: local.getUTCHours(),
    weekday: local.getUTCDay(),
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
