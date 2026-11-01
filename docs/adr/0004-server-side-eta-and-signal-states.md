# ADR-0004 — Server-side ETAs and an explicit GPS-signal state machine

**Status:** Accepted · **Date:** 2026-10-31

## Context
Students must get consistent arrival estimates (two students at the same stop must see the same number), and the system must stay honest when positions stop arriving (QA-3). Phones also have wrong clocks.

## Decision
* ETAs are computed **on the server** from route-referenced progress ("metres along the route", with a search window to stay on the correct lane of two-way roads) using an injected `EtaStrategy`; the default `BlendedSpeedEta` mixes observed moving speed (60 %) with the planned speed (40 %), clamped to 8–50 km/h, plus dwell time per intermediate stop. Results carry an absolute `arrivalAt`; clients count down with a server-time offset.
* Data freshness is an explicit **state machine** (`AwaitingFix → Live ⇄ Stale → Lost`, thresholds 20 s / 60 s, configurable) implemented with the State pattern. Each state decides how ETAs may be presented: live, approximate (with "Due" when passed), or not at all.
* Every upload carries `sentAt`; the server shifts all positions by `serverNow − sentAt`, so device clock errors cancel out. Positions are validated (accuracy ≤ 150 m, ≤ 10 min old, inside the service area, no > 110 km/h jumps, ≥ 1 s apart) and processed in time order.

## Consequences
* + One source of truth; behaviour is unit-tested; the UML state machine maps one-to-one onto classes.
* + Thresholds and the ETA algorithm can change without touching clients.
* − ETA quality depends on the planned speeds entered by the office; there is no timetable fallback when GPS is lost (deliberately: no estimate rather than a wrong one).
* − Thresholds were chosen for the simulator's 3 s interval; they must be validated with real phones.
