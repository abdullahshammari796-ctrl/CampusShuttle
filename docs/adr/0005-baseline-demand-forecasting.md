# ADR-0005 — Explainable baseline forecasts; no trained ML model yet

**Status:** Accepted · **Date:** 2026-10-31

## Context
The office wants expected waiting demand per stop and hour. No real historical data exists. The recommended ML lifecycle (RBC Borealis field guide) places a **feasibility** stage before model development and asks for a baseline first.

## Decision
Implement three explainable strategies behind `DemandPredictor` — seasonal average (4 weeks), weighted seasonal (6 weeks, decay 0.7) and a naive hour-of-day mean as the reference to beat — plus a rolling-origin backtest (MAE, RMSE, bias, range coverage). Use a deterministic **synthetic** history only to demonstrate and test the pipeline; label it in the database (`source = 'synthetic'`), the API (`dataSources`) and the UI (warning banners). Do **not** train an ML model on synthetic data.

## Consequences
* + Every forecast can be explained to a non-expert (the exact past values and weights are shown).
* + Live waiting requests automatically become real history; the same backtest will evaluate real data.
* + A trained model can be added later as another strategy and must beat the seasonal baseline on held-out real weeks.
* − Waiting requests measure *expressed* demand only (students who use the feature), not all riders.
* − The synthetic generator encodes our assumptions; its evaluation numbers say nothing about reality.
