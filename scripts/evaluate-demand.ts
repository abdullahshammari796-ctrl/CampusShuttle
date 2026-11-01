// Reproducible evaluation of the demand predictors (npm run evaluate).
//
// Seeds an in-memory database with the deterministic SYNTHETIC history as of
// a fixed date, then backtests every predictor over the last 14 days.
// The result describes the method on synthetic data only — it is not a
// measurement of real-world accuracy.
import { loadConfig } from '../src/config.ts';
import { buildContainer } from '../src/container.ts';
import { ManualClock } from '../src/shared/clock.ts';

const AS_OF = Date.UTC(2026, 9, 5, 5, 0, 0); // Monday 5 Oct 2026, 09:00 campus time
const container = await buildContainer(loadConfig({}, { dbFile: ':memory:' }), { clock: new ManualClock(AS_OF) });
const evaluation = container.demand.evaluate(14);

console.log(`Backtest ${evaluation.testFrom} → ${evaluation.testTo} · data sources: ${evaluation.dataSources.join(', ')} (SYNTHETIC demo data)`);
console.log('| Model | MAE | RMSE | Bias | Range coverage | Stop-hours |');
console.log('|---|---:|---:|---:|---:|---:|');
for (const r of evaluation.results) {
  const coverage = r.intervalCoverage === null ? '–' : `${Math.round(r.intervalCoverage * 100)} %`;
  console.log(`| ${r.label} | ${r.mae} | ${r.rmse} | ${r.bias} | ${coverage} | ${r.samples} |`);
}
container.stop();
