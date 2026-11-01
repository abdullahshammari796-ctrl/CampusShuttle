# ADR-0008 — TypeScript executed directly by Node 24 (no build step)

**Status:** Accepted · **Date:** 2026-10-31

## Context
Explicit, checked interfaces matter for an architecture course (ports, strategies, states), but build pipelines add failure points for a small team and for the live demonstration.

## Decision
Server code is TypeScript limited to *erasable syntax* (`erasableSyntaxOnly`), which Node 24 runs directly by stripping types. `tsc --noEmit` is used only for type checking (`npm run typecheck`). Browser code is plain ES modules served as static files — no bundler, no framework. Third-party runtime dependencies: Express only.

## Consequences
* + `npm install && npm start` is the whole setup; stack traces point to real source lines.
* + Explicit interfaces make comparison with the class-diagram sources easier; rendering and member-level comparison remain separate checks.
* − No enums, namespaces or parameter properties (constructor assignments are written out).
* − Browser code has no type checking and no component framework; UI updates are hand-written with an escaping template helper.
* − Requires Node ≥ 22.18 (24 LTS recommended).
