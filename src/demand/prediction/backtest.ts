import type { DemandPredictor } from './demand-predictor.ts';
import type { HourlySeries } from './hourly-series.ts';

export interface BacktestOptions {
  testDates: string[];
  stopIds: string[];
  hours: number[];
}

export interface BacktestResult {
  predictorId: string;
  label: string;
  /** Stop-hours that had both an actual value and a forecast. */
  samples: number;
  /** Stop-hours skipped because the predictor had no history. */
  skipped: number;
  /** Mean absolute error, in requests per stop-hour. */
  mae: number | null;
  rmse: number | null;
  /** Mean (forecast − actual); positive means over-forecasting. */
  bias: number | null;
  /** Share of actual values inside the forecast's low–high range. */
  intervalCoverage: number | null;
  testFrom: string | null;
  testTo: string | null;
}

/**
 * Rolling-origin backtest: every test stop-hour is forecast using only data
 * from earlier dates, then compared with what actually happened.
 */
export function backtest(predictor: DemandPredictor, history: HourlySeries, options: BacktestOptions): BacktestResult {
  let samples = 0;
  let skipped = 0;
  let absError = 0;
  let squaredError = 0;
  let signedError = 0;
  let covered = 0;

  for (const date of options.testDates) {
    for (const stopId of options.stopIds) {
      for (const hour of options.hours) {
        const actual = history.count(stopId, date, hour);
        if (actual === undefined) continue;
        const prediction = predictor.predict(history, { stopId, date, hour });
        if (prediction.expected === null) {
          skipped++;
          continue;
        }
        const error = prediction.expected - actual;
        samples++;
        absError += Math.abs(error);
        squaredError += error * error;
        signedError += error;
        if (prediction.low !== null && prediction.high !== null && actual >= prediction.low && actual <= prediction.high) covered++;
      }
    }
  }

  const round = (v: number) => Math.round(v * 100) / 100;
  const dates = [...options.testDates].sort();
  return {
    predictorId: predictor.id,
    label: predictor.label,
    samples,
    skipped,
    mae: samples ? round(absError / samples) : null,
    rmse: samples ? round(Math.sqrt(squaredError / samples)) : null,
    bias: samples ? round(signedError / samples) : null,
    intervalCoverage: samples ? round(covered / samples) : null,
    testFrom: dates[0] ?? null,
    testTo: dates[dates.length - 1] ?? null,
  };
}
