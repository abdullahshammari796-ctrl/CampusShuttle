import type { HourlySeries } from './hourly-series.ts';

export interface PredictionTarget {
  stopId: string;
  /** Local calendar date (YYYY-MM-DD). */
  date: string;
  /** Local clock hour, 0–23. */
  hour: number;
}

/** One past observation the prediction was built from, and how much it counted. */
export interface BasisPoint {
  date: string;
  count: number;
  weight: number;
}

export interface DemandPrediction extends PredictionTarget {
  /** Expected waiting requests in that hour, or null when there is not enough history. */
  expected: number | null;
  /** Plausible range (min/max of the basis), shown so users see the uncertainty. */
  low: number | null;
  high: number | null;
  basis: BasisPoint[];
  explanation: string;
}

/**
 * Strategy pattern for demand forecasting. Every predictor is explainable:
 * it returns the exact past observations and weights it used. Predictors
 * must only read dates strictly before the target date (no leakage), which
 * the backtest relies on.
 */
export interface DemandPredictor {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  predict(history: HourlySeries, target: PredictionTarget): DemandPrediction;
}

export function weightedPrediction(target: PredictionTarget, basis: BasisPoint[], explain: (expected: number) => string, emptyMessage: string): DemandPrediction {
  if (basis.length === 0) {
    return { ...target, expected: null, low: null, high: null, basis, explanation: emptyMessage };
  }
  const totalWeight = basis.reduce((s, b) => s + b.weight, 0);
  const expected = round1(basis.reduce((s, b) => s + b.count * b.weight, 0) / totalWeight);
  const counts = basis.map((b) => b.count);
  return {
    ...target,
    expected,
    low: Math.min(...counts),
    high: Math.max(...counts),
    basis,
    explanation: explain(expected),
  };
}

export const round1 = (v: number): number => Math.round(v * 10) / 10;
export const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
