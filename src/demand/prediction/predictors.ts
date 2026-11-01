import { WEEKDAY_NAMES, addDays, weekdayOf } from '../../shared/clock.ts';
import {
  type BasisPoint, type DemandPrediction, type DemandPredictor, type PredictionTarget, hourLabel, weightedPrediction,
} from './demand-predictor.ts';
import type { HourlySeries } from './hourly-series.ts';

/**
 * Baseline model: the same hour on the same weekday in recent weeks.
 * Campus demand follows the weekly timetable, so this is the natural
 * first model and the one every later model must beat.
 */
export class SeasonalAveragePredictor implements DemandPredictor {
  readonly id = 'seasonal-average';
  readonly label = 'Seasonal average (4 weeks)';
  readonly description = 'Mean of the same stop, weekday and hour over the previous 4 weeks. Range = lowest–highest of those weeks.';
  private readonly weeks: number;

  constructor(weeks = 4) {
    this.weeks = weeks;
  }

  predict(history: HourlySeries, target: PredictionTarget): DemandPrediction {
    const basis = sameWeekdayBasis(history, target, this.weeks, () => 1);
    const day = WEEKDAY_NAMES[weekdayOf(target.date)];
    return weightedPrediction(
      target,
      basis,
      (expected) => `Average of ${basis.length} previous ${day}s, ${hourLabel(target.hour)}: ${basis.map((b) => b.count).join(', ')} → ${expected}.`,
      `No ${day} history for this stop yet, so no forecast is made.`,
    );
  }
}

/** Same idea, but recent weeks count more, so it reacts faster to a changing semester. */
export class WeightedSeasonalPredictor implements DemandPredictor {
  readonly id = 'weighted-seasonal';
  readonly label = 'Weighted seasonal (6 weeks)';
  readonly description = 'Weighted mean of the same stop, weekday and hour over 6 weeks; each older week counts 0.7× the next.';
  private readonly weeks: number;
  private readonly decay: number;

  constructor(weeks = 6, decay = 0.7) {
    this.weeks = weeks;
    this.decay = decay;
  }

  predict(history: HourlySeries, target: PredictionTarget): DemandPrediction {
    const basis = sameWeekdayBasis(history, target, this.weeks, (k) => Math.round(this.decay ** (k - 1) * 1000) / 1000);
    const day = WEEKDAY_NAMES[weekdayOf(target.date)];
    return weightedPrediction(
      target,
      basis,
      (expected) =>
        `Weighted average of ${basis.length} previous ${day}s, ${hourLabel(target.hour)}: ` +
        `${basis.map((b) => `${b.count}×${b.weight}`).join(', ')} → ${expected}. Recent weeks count more.`,
      `No ${day} history for this stop yet, so no forecast is made.`,
    );
  }
}

/** Deliberately naive reference: ignores the weekday. A useful model must beat it. */
export class HourOfDayMeanPredictor implements DemandPredictor {
  readonly id = 'hour-of-day-mean';
  readonly label = 'Hour-of-day mean (naive reference)';
  readonly description = 'Mean of the same stop and hour over the previous 28 days, ignoring the weekday. Used as a comparison baseline.';
  private readonly days: number;

  constructor(days = 28) {
    this.days = days;
  }

  predict(history: HourlySeries, target: PredictionTarget): DemandPrediction {
    const basis: BasisPoint[] = [];
    for (let k = 1; k <= this.days; k++) {
      const date = addDays(target.date, -k);
      const count = history.count(target.stopId, date, target.hour);
      if (count !== undefined) basis.push({ date, count, weight: 1 });
    }
    return weightedPrediction(
      target,
      basis,
      (expected) => `Average of ${hourLabel(target.hour)} over the previous ${basis.length} days with data (all weekdays) → ${expected}.`,
      'No history for this stop yet, so no forecast is made.',
    );
  }
}

function sameWeekdayBasis(history: HourlySeries, target: PredictionTarget, weeks: number, weight: (k: number) => number): BasisPoint[] {
  const basis: BasisPoint[] = [];
  for (let k = 1; k <= weeks; k++) {
    const date = addDays(target.date, -7 * k);
    const count = history.count(target.stopId, date, target.hour);
    if (count !== undefined) basis.push({ date, count, weight: weight(k) });
  }
  return basis;
}
