import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HourlyDemand } from '../../src/demand/model.ts';
import { backtest } from '../../src/demand/prediction/backtest.ts';
import { HourlySeries } from '../../src/demand/prediction/hourly-series.ts';
import { HourOfDayMeanPredictor, SeasonalAveragePredictor, WeightedSeasonalPredictor } from '../../src/demand/prediction/predictors.ts';
import { SYNTHETIC_STOP_WEIGHTS } from '../../src/seed/demo-data.ts';
import { generateSyntheticDemand } from '../../src/seed/synthetic-demand.ts';
import { addDays } from '../../src/shared/clock.ts';

const row = (date: string, count: number, hour = 8, stopId = 'lib'): HourlyDemand => ({ stopId, date, hour, count, source: 'synthetic' });
// Mondays: 2026-09-14, 21, 28, 10-05, 10-12 (target).
const mondays = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'];

describe('HourlySeries', () => {
  it('distinguishes zero demand on a covered day from an unknown day', () => {
    const s = new HourlySeries([row('2026-10-05', 4)], ['2026-10-06']);
    assert.equal(s.count('lib', '2026-10-05', 8), 4);
    assert.equal(s.count('lib', '2026-10-05', 9), 0, 'covered day, no requests');
    assert.equal(s.count('lib', '2026-10-06', 8), 0, 'covered by data collection');
    assert.equal(s.count('lib', '2026-10-07', 8), undefined, 'no data collected');
  });
});

describe('Demand predictors (Strategy pattern, explainable)', () => {
  const history = new HourlySeries(mondays.map((d, i) => row(d, [10, 14, 11, 13][i])), []);
  const target = { stopId: 'lib', date: '2026-10-12', hour: 8 };

  it('seasonal average = mean of the same weekday and hour over 4 weeks, with its basis', () => {
    const p = new SeasonalAveragePredictor().predict(history, target);
    assert.equal(p.expected, 12);
    assert.equal(p.low, 10);
    assert.equal(p.high, 14);
    assert.deepEqual(p.basis.map((b) => b.date), ['2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14']);
    assert.match(p.explanation, /Average of 4 previous Mondays.*13, 11, 14, 10 → 12/);
  });

  it('weighted seasonal gives recent weeks more weight', () => {
    const p = new WeightedSeasonalPredictor(4, 0.5).predict(history, target);
    // weights 1, .5, .25, .125 on 13, 11, 14, 10
    const expected = (13 + 0.5 * 11 + 0.25 * 14 + 0.125 * 10) / 1.875;
    assert.equal(p.expected, Math.round(expected * 10) / 10);
    assert.deepEqual(p.basis.map((b) => b.weight), [1, 0.5, 0.25, 0.125]);
  });

  it('hour-of-day mean ignores the weekday', () => {
    const s = new HourlySeries([row('2026-10-11', 2), row('2026-10-10', 4)], []);
    const p = new HourOfDayMeanPredictor(28).predict(s, target);
    assert.equal(p.expected, 3);
    assert.equal(p.basis.length, 2);
  });

  it('makes no forecast (rather than a fake zero) without history', () => {
    const p = new SeasonalAveragePredictor().predict(new HourlySeries([], []), target);
    assert.equal(p.expected, null);
    assert.match(p.explanation, /No Monday history/);
  });

  it('never looks at the target day or later (no leakage)', () => {
    const withFuture = new HourlySeries([...mondays.map((d, i) => row(d, [10, 14, 11, 13][i])), row('2026-10-12', 500), row('2026-10-19', 900)], []);
    for (const predictor of [new SeasonalAveragePredictor(), new WeightedSeasonalPredictor(), new HourOfDayMeanPredictor()]) {
      assert.deepEqual(predictor.predict(withFuture, target).expected, predictor.predict(history, target).expected, predictor.id);
    }
  });
});

describe('Backtest', () => {
  it('computes MAE, RMSE, bias and range coverage from rolling-origin forecasts', () => {
    // Weekly pattern 10, 12, 14 then test day actual 20. Seasonal(3) predicts 12.
    const s = new HourlySeries([row('2026-09-21', 10), row('2026-09-28', 12), row('2026-10-05', 14), row('2026-10-12', 20)], []);
    const r = backtest(new SeasonalAveragePredictor(3), s, { testDates: ['2026-10-12'], stopIds: ['lib'], hours: [8] });
    assert.equal(r.samples, 1);
    assert.equal(r.mae, 8);
    assert.equal(r.rmse, 8);
    assert.equal(r.bias, -8);
    assert.equal(r.intervalCoverage, 0);
  });

  it('skips stop-hours where a model cannot forecast and reports them', () => {
    const s = new HourlySeries([row('2026-10-12', 5)], []);
    const r = backtest(new SeasonalAveragePredictor(), s, { testDates: ['2026-10-12'], stopIds: ['lib'], hours: [8] });
    assert.equal(r.samples, 0);
    assert.equal(r.skipped, 1);
    assert.equal(r.mae, null);
  });
});

describe('Synthetic demand generator (demo data)', () => {
  const options = { endDate: '2026-10-04', days: 28, stopWeights: SYNTHETIC_STOP_WEIGHTS, serviceHours: { first: 7, last: 21 } };

  it('is deterministic for a seed, labelled synthetic, and within the requested dates', () => {
    const a = generateSyntheticDemand(options);
    const b = generateSyntheticDemand(options);
    assert.deepEqual(a, b);
    assert.notDeepEqual(generateSyntheticDemand({ ...options, seed: 7 }), a);
    assert.ok(a.every((r) => r.source === 'synthetic' && r.date >= addDays('2026-10-04', -27) && r.date <= '2026-10-04'));
  });

  it('encodes its stated weekly pattern (weekday mornings busier than weekends)', () => {
    const rows = generateSyntheticDemand(options);
    const total = (pred: (r: HourlyDemand) => boolean) => rows.filter(pred).reduce((s, r) => s + r.count, 0);
    const day = (r: HourlyDemand) => new Date(`${r.date}T00:00:00Z`).getUTCDay();
    const weekdayMorning = total((r) => r.hour === 8 && day(r) >= 1 && day(r) <= 4);
    const weekendMorning = total((r) => r.hour === 8 && (day(r) === 0 || day(r) === 6));
    assert.ok(weekdayMorning > 4 * weekendMorning);
  });
});
