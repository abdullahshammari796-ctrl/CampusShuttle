import type { NetworkReader } from '../network/ports.ts';
import { type Clock, WEEKDAY_NAMES, addDays, isIsoDate, localDateHour, weekdayOf } from '../shared/clock.ts';
import { notFound, validationError } from '../shared/errors.ts';
import type { DemandSource } from './model.ts';
import type { DemandHistoryRepository } from './ports.ts';
import { type BacktestResult, backtest } from './prediction/backtest.ts';
import { type DemandPrediction, type DemandPredictor, round1 } from './prediction/demand-predictor.ts';
import { HourlySeries } from './prediction/hourly-series.ts';

export interface DemandServiceDeps {
  history: DemandHistoryRepository;
  network: NetworkReader;
  predictors: DemandPredictor[];
  clock: Clock;
  timezoneOffsetMinutes: number;
  serviceHours: { first: number; last: number };
}

export interface ForecastView {
  date: string;
  weekday: string;
  model: { id: string; label: string; description: string };
  hours: number[];
  dataSources: DemandSource[];
  stops: Array<{ stopId: string; stopName: string; total: number; predictions: Array<{ hour: number; expected: number | null; low: number | null; high: number | null }> }>;
  hourlyTotals: Array<{ hour: number; expected: number }>;
  peak: { hour: number; expected: number } | null;
  coverage: { forecastCells: number; noHistoryCells: number };
}

export interface HistoryView {
  from: string;
  to: string;
  dataSources: DemandSource[];
  daily: Array<{ date: string; weekday: number; total: number }>;
  weekdayHour: { hours: number[]; rows: Array<{ weekday: number; name: string; values: number[] }> };
  byStop: Array<{ stopId: string; stopName: string; total: number }>;
}

export interface EvaluationView {
  testFrom: string;
  testTo: string;
  dataSources: DemandSource[];
  results: BacktestResult[];
}

/** History loaded for forecasting: enough for the longest look-back (6 weeks). */
const LOOKBACK_DAYS = 49;

/** Demand analytics for the transport office: trends, forecasts, explanations and evaluation. */
export class DemandService {
  private readonly deps: DemandServiceDeps;

  constructor(deps: DemandServiceDeps) {
    if (deps.predictors.length === 0) throw new Error('At least one demand predictor is required.');
    this.deps = deps;
  }

  models(): Array<{ id: string; label: string; description: string }> {
    return this.deps.predictors.map(({ id, label, description }) => ({ id, label, description }));
  }

  today(): string {
    return localDateHour(this.deps.clock.now(), this.deps.timezoneOffsetMinutes).date;
  }

  forecast(date: string, modelId?: string): ForecastView {
    if (!isIsoDate(date)) throw validationError('date must be YYYY-MM-DD.');
    const predictor = this.predictor(modelId);
    const series = this.series(addDays(date, -LOOKBACK_DAYS), addDays(date, -1));
    const hours = this.hours();
    const totals = new Map<number, number>(hours.map((h) => [h, 0]));
    let forecastCells = 0;
    let noHistoryCells = 0;

    const stops = this.deps.network.listStops().map((stop) => {
      const predictions = hours.map((hour) => {
        const p = predictor.predict(series, { stopId: stop.id, date, hour });
        if (p.expected === null) noHistoryCells++;
        else {
          forecastCells++;
          totals.set(hour, (totals.get(hour) ?? 0) + p.expected);
        }
        return { hour, expected: p.expected, low: p.low, high: p.high };
      });
      const total = round1(predictions.reduce((s, p) => s + (p.expected ?? 0), 0));
      return { stopId: stop.id, stopName: stop.name, total, predictions };
    });

    const hourlyTotals = hours.map((hour) => ({ hour, expected: round1(totals.get(hour) ?? 0) }));
    const peak = forecastCells === 0 ? null : hourlyTotals.reduce((best, h) => (h.expected > best.expected ? h : best));
    return {
      date,
      weekday: WEEKDAY_NAMES[weekdayOf(date)],
      model: { id: predictor.id, label: predictor.label, description: predictor.description },
      hours,
      dataSources: [...series.sources].sort(),
      stops,
      hourlyTotals,
      peak,
      coverage: { forecastCells, noHistoryCells },
    };
  }

  explain(stopId: string, date: string, hour: number, modelId?: string): DemandPrediction & { stopName: string; model: string } {
    if (!isIsoDate(date)) throw validationError('date must be YYYY-MM-DD.');
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw validationError('hour must be 0–23.');
    const stop = this.deps.network.getStop(stopId);
    if (!stop) throw notFound('Stop not found.');
    const predictor = this.predictor(modelId);
    const series = this.series(addDays(date, -LOOKBACK_DAYS), addDays(date, -1));
    return { ...predictor.predict(series, { stopId, date, hour }), stopName: stop.name, model: predictor.label };
  }

  history(weeks: number): HistoryView {
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 26) throw validationError('weeks must be 1–26.');
    const to = this.today();
    const from = addDays(to, -7 * weeks);
    const { rows, coveredDates } = this.deps.history.load(from, to);
    const hours = this.hours();
    const stops = this.deps.network.listStops();
    const daily = new Map<string, number>();
    for (const date of coveredDates) if (date >= from && date <= to) daily.set(date, 0);
    const byStop = new Map<string, number>(stops.map((s) => [s.id, 0]));
    const sums = Array.from({ length: 7 }, () => hours.map(() => 0));
    const daysPerWeekday = Array.from({ length: 7 }, () => 0);
    const sources = new Set<DemandSource>();

    for (const row of rows) {
      sources.add(row.source);
      daily.set(row.date, (daily.get(row.date) ?? 0) + row.count);
      byStop.set(row.stopId, (byStop.get(row.stopId) ?? 0) + row.count);
      const hourIndex = hours.indexOf(row.hour);
      if (hourIndex >= 0) sums[weekdayOf(row.date)][hourIndex] += row.count;
    }
    for (const date of daily.keys()) daysPerWeekday[weekdayOf(date)]++;

    const order = [1, 2, 3, 4, 5, 6, 0]; // Monday first
    return {
      from,
      to,
      dataSources: [...sources].sort(),
      daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, weekday: weekdayOf(date), total })),
      weekdayHour: {
        hours,
        rows: order.map((weekday) => ({
          weekday,
          name: WEEKDAY_NAMES[weekday],
          values: sums[weekday].map((sum) => (daysPerWeekday[weekday] ? round1(sum / daysPerWeekday[weekday]) : 0)),
        })),
      },
      byStop: stops.map((s) => ({ stopId: s.id, stopName: s.name, total: byStop.get(s.id) ?? 0 })).sort((a, b) => b.total - a.total),
    };
  }

  /** Backtests every model over the most recent `testDays` days that have data. */
  evaluate(testDays = 14): EvaluationView {
    const to = addDays(this.today(), -1);
    const from = addDays(to, -(testDays - 1));
    const series = this.series(addDays(from, -LOOKBACK_DAYS), to);
    const testDates = series.dates().filter((d) => d >= from && d <= to);
    const options = { testDates, stopIds: this.deps.network.listStops().map((s) => s.id), hours: this.hours() };
    return {
      testFrom: from,
      testTo: to,
      dataSources: [...series.sources].sort(),
      results: this.deps.predictors.map((p) => backtest(p, series, options)),
    };
  }

  private series(from: string, to: string): HourlySeries {
    const { rows, coveredDates } = this.deps.history.load(from, to);
    return new HourlySeries(rows, coveredDates);
  }

  private predictor(modelId?: string): DemandPredictor {
    if (!modelId) return this.deps.predictors[0];
    const predictor = this.deps.predictors.find((p) => p.id === modelId);
    if (!predictor) throw validationError(`Unknown model ${modelId}.`);
    return predictor;
  }

  private hours(): number[] {
    const { first, last } = this.deps.serviceHours;
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  }
}
