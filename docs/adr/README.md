# Architecture decision records

Each record states the context, the decision, the alternatives considered and the consequences. Status values: *Accepted* (implemented), *Proposed* (not yet implemented).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith with ports and adapters | Accepted |
| [0002](0002-server-sent-events.md) | Server-Sent Events for live updates, REST for uploads | Accepted |
| [0003](0003-sqlite-builtin.md) | SQLite through Node's built-in `node:sqlite` | Accepted |
| [0004](0004-server-side-eta-and-signal-states.md) | Server-side ETAs and an explicit GPS-signal state machine | Accepted |
| [0005](0005-baseline-demand-forecasting.md) | Explainable baseline forecasts; no trained ML model yet | Accepted |
| [0006](0006-session-cookies-and-rbac.md) | Signed HttpOnly session cookies and role checks at the edge | Accepted |
| [0007](0007-offline-schematic-map.md) | Offline schematic SVG map instead of map tiles | Accepted |
| [0008](0008-typescript-without-build.md) | TypeScript executed directly by Node 24 (no build step) | Accepted |

To propose a change, add a new numbered record (do not rewrite an accepted one) and mark the record it replaces as *Superseded by ADR-xxxx*.

Technical evidence for issue #9: [Zuhair-requested review of ADR-0001, 0002, 0003 and 0008](zuhair-technical-review.md) and [review of ADR-0004 to 0007 prepared for Abdullah](abdullah-technical-review.md). Both were prepared with AI assistance and do not replace each member's personal cross-review, which is still OUTSTANDING.
