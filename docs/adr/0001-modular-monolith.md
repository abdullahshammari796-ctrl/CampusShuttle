# ADR-0001 — Modular monolith with ports and adapters

**Status:** Accepted · **Date:** 2026-10-31

## Context
Drivers: real-time freshness for many viewers, robustness to GPS/network loss, privacy, modifiability/testability; constraints: a two-person team and no paid infrastructure. Four candidates were compared in the report (§6.3): modular monolith with event bus and SSE (A), microservices with a broker (B), monolith with polling (C), serverless backend-as-a-service (D). Weighted scores: A 61, D 51, C 46, B 44 (out of 70).

## Decision
One deployable Node.js process, internally split into components (`identity`, `network`, `tracking`, `demand`, `realtime`, `web`, `persistence`, `shared`). Business components define **port interfaces** for what they need (repositories, `NetworkReader`, `EventPublisher`, `Clock`); adapters implement them; `src/container.ts` is the only composition root. Components that must react to each other (tracking → demand) communicate through **domain events**, not imports.

## Consequences
* + Simplest operation (`npm start`, one database file); lowest latency (in-process).
* + Permitted source imports are checked by `test/architecture.test.ts`; this does not prove all runtime boundaries or UML details.
* + Every business rule is unit-testable with in-memory adapters and a manual clock.
* − Single point of failure; mitigated by persisting before updating memory and by `TrackingService.recover()` on restart.
* − Vertical scaling only, until the event bus is replaced by a broker (see ADR-0002).
* Revisit if: several campuses, more than one server instance, or independent release cycles become necessary.

## Reassessment — 6 November 2026
The options were re-scored in `docs/architecture/technical-assessment.md` (a technical assessment, not either member's personal view). The draft had let the polling transport lower option C's modularity score; corrected totals: A 61, C 52, D 45, B 44. The decision stands. Its sensitivity point: A beats C only on freshness (QA-1), so a relaxed freshness requirement would make a polling monolith an equally good choice.
