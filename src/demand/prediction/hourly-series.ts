import type { DemandSource, HourlyDemand } from '../model.ts';

/**
 * Read-only lookup of hourly demand. Distinguishes "zero requests" (the date
 * was covered by data collection) from "unknown" (no data for that date), so
 * predictors never mistake missing history for quiet hours.
 */
export class HourlySeries {
  readonly sources: ReadonlySet<DemandSource>;
  private readonly counts = new Map<string, number>();
  private readonly covered: Set<string>;

  constructor(rows: readonly HourlyDemand[], coveredDates: Iterable<string>) {
    this.covered = new Set(coveredDates);
    const sources = new Set<DemandSource>();
    for (const row of rows) {
      const key = HourlySeries.key(row.stopId, row.date, row.hour);
      this.counts.set(key, (this.counts.get(key) ?? 0) + row.count);
      this.covered.add(row.date);
      sources.add(row.source);
    }
    this.sources = sources;
  }

  count(stopId: string, date: string, hour: number): number | undefined {
    if (!this.covered.has(date)) return undefined;
    return this.counts.get(HourlySeries.key(stopId, date, hour)) ?? 0;
  }

  hasDate(date: string): boolean {
    return this.covered.has(date);
  }

  dates(): string[] {
    return [...this.covered].sort();
  }

  private static key(stopId: string, date: string, hour: number): string {
    return `${stopId}|${date}|${hour}`;
  }
}
