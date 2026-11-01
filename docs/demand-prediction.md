# Demand prediction — approach, data, evaluation and limits

## 1. The question
*How many students will be waiting at each stop in each hour of a given day?* The transport office uses the answer to decide how many shuttles to run on which route and when. The measure is the number of **waiting requests** ("I'm waiting here") per stop and local clock hour (UAE time, UTC+4).

## 2. Data

| Source | What it is | Label |
|---|---|---|
| Live | Every waiting request created in this system, aggregated per stop and hour; days on which trips ran count as observed days (a stop-hour without requests on such a day is a real zero) | `source = 'live'` |
| Synthetic | 56 days generated at first start by `src/seed/synthetic-demand.ts` (fixed random seed 305) | `source = 'synthetic'`, warning banners in the UI, `dataSources` in every API response |

**The synthetic history is invented.** It encodes these assumptions, none of which comes from a real university: Monday–Friday teaching week (UAE weekend Saturday–Sunday); peaks before morning classes, at lunch and in the late afternoon; Friday afternoons quieter; weekends at 20–25 % of weekday demand; a +1 % per week drift; relative stop popularity set by hand; Poisson noise. Its only purpose is to demonstrate and test the pipeline end to end.

Known bias of the live measure: waiting requests count students who *use the feature*, not all riders. Real deployment would compare them with boarding counts.

## 3. Models (Strategy pattern, `src/demand/prediction/`)

| Model | Rule | Why it is there |
|---|---|---|
| Seasonal average (default) | Mean of the same stop, weekday and hour over the previous 4 weeks | Demand follows the weekly timetable; simplest model that captures it |
| Weighted seasonal | Same, over 6 weeks, each older week weighted 0.7× the next | Reacts faster when the semester pattern shifts |
| Same-weekday median | Median of the same stop, weekday and hour over the previous 6 weeks | Less sensitive to an unusually busy or quiet week than a mean; an equally explainable fourth strategy (issue #6) |
| Hour-of-day mean | Mean of the same stop and hour over the previous 28 days, ignoring the weekday | Naive reference: a useful model must beat it |

Every prediction returns the exact **basis** (past dates, counts and weights), a **low–high range** (min–max of the basis), and a one-sentence **explanation**. For the median, every historical observation has weight 1 (unweighted median, not a weighted average). The low–high range is descriptive, **not** a statistical confidence interval; an extreme observation can make it wide. With no history the model returns *no forecast* instead of zero. Predictors only read dates strictly before the target date (tested), so the backtest has no look-ahead.

## 4. Evaluation

Rolling-origin backtest (`src/demand/prediction/backtest.ts`): every stop-hour of the evaluation window is predicted using only earlier days, then compared with what happened. Metrics: MAE and RMSE (requests per stop-hour), bias (mean forecast − actual), and range coverage (share of actual values within low–high).

Reproducible run on the deterministic synthetic history as of Monday 5 Oct 2026 (`npm run evaluate`; output in `docs/evidence/demand-evaluation.txt`):

| Model | MAE | RMSE | Bias | Range coverage | Stop-hours |
|---|---:|---:|---:|---:|---:|
| Seasonal average (4 weeks) | 1.45 | 1.99 | −0.03 | 75 % | 1,890 |
| Weighted seasonal (6 weeks) | 1.44 | 1.99 | −0.06 | 83 % | 1,890 |
| Same-weekday median (6 weeks) | 1.42 | 2.01 | −0.22 | 83 % | 1,890 |
| Hour-of-day mean (naive reference) | 1.98 | 2.69 | −0.04 | 97 % | 1,890 |

**Reproduction for issue #6 (1 Nov 2026):** the synthetic generator, `HourlySeries` and `backtest()` were run directly under Node 22.16, matching all three previously documented baseline results and producing the fourth row. This environment did not have the full project's dependencies or required Node 24 setup, so the complete `npm run evaluate` command and server integration should be repeated by Abdullah before merging.

**How to read this honestly.** The median had slightly lower MAE (1.42 versus 1.44 weighted seasonal) but slightly worse RMSE (2.01 versus 1.99) and more negative bias (−0.22 versus −0.06) on this *synthetic* history. The data was generated with weekday seasonality, so models that use the weekday beat the one that does not — the evaluation confirms the pipeline behaves as designed and nothing more. These figures must not be presented as the accuracy of the system on a real campus. The hour-of-day mean's high coverage comes from its wide range, not from accuracy.

## 5. Relation to the ML development lifecycle (RBC Borealis field guide)

The recommended reading describes six stages — discovery, feasibility, design requirements, model and product development, production, and support and maintenance — and stresses starting with a baseline and asking whether ML is needed at all.

| Stage | Applied here |
|---|---|
| Discovery | Business question and outcome defined (§1); data sources identified (§2) |
| Feasibility | No real data → ML not feasible yet; baselines + labelled synthetic data to build and test the pipeline (ADR-0005) |
| Design requirements | Explanations, ranges and "no forecast without history" designed for non-expert office users |
| Model & product development | Simple → complex: naive reference, seasonal, weighted seasonal and same-weekday median; backtest with no look-ahead |
| Production | Forecasts computed on request from the live database; live requests become history automatically |
| Support & maintenance | The backtest is the monitoring tool; rerun on live data each month |

**When to add a trained model.** After at least one full semester of live data: hold out the most recent weeks, train candidates (for example gradient-boosted trees with weekday, hour, stop, academic-calendar and weather features), and adopt one only if it beats the seasonal average on the held-out real weeks by a margin the office cares about, and only if its predictions can still be explained. It would be added as another `DemandPredictor` — no other code changes (QA-7).
