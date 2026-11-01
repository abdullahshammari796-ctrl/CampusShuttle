import { WEEKDAY_NAMES, addDays, weekdayOf } from '../../shared/clock.ts';
import {
  type BasisPoint, type DemandPrediction, type DemandPredictor, type PredictionTarget, hourLabel, round1,
} from './demand-predictor.ts';
import type { HourlySeries } from './hourly-series.ts';

/**
 * Robust, explainable baseline: median demand at the same stop, weekday and
 * hour in the preceding six weeks. An exceptionally busy week cannot pull the
 * forecast upward as strongly as it pulls an arithmetic mean.
 */
export class SameWeekdayMedianPredictor implements DemandPredictor {
  readonly id = 'same-weekday-median';
  readonly label = 'Same-weekday median (6 weeks)';
  readonly description = 'Median requests at this stop, weekday and hour across the previous 6 weeks. Range = smallest–largest past count (not a confidence interval).';

  predict(history: HourlySeries, target: PredictionTarget): DemandPrediction {
    const basis: BasisPoint[] = [];
    for (let week = 1; week <= 6; week++) {
      const date = addDays(target.date, -7 * week);
      const count = history.count(target.stopId, date, target.hour);
      if (count !== undefined) basis.push({ date, count, weight: 1 });
    }

    const weekday = WEEKDAY_NAMES[weekdayOf(target.date)];
    if (basis.length === 0) {
      return {
        ...target, expected: null, low: null, high: null, basis,
        explanation: `No ${weekday} history for this stop yet, so no forecast is made.`,
      };
    }

    const counts = basis.map((point) => point.count).sort((a, b) => a - b);
    const middle = Math.floor(counts.length / 2);
    const median = counts.length % 2 === 1
      ? counts[middle]
      : (counts[middle - 1] + counts[middle]) / 2;
    const expected = round1(median);

    return {
      ...target,
      expected,
      low: counts[0],
      high: counts[counts.length - 1],
      basis,
      explanation: `Median of ${basis.length} previous ${weekday}s, ${hourLabel(target.hour)}: ` +
        `${basis.map((point) => point.count).join(', ')} → ${expected}. ` +
        'The middle count is used to reduce the effect of outlier weeks.',
    };
  }
}
