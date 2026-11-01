# Technical architecture review requested by Zuhair — 1 November 2026

This is ChatGPT Work's source/evidence review, requested by Zuhair, for his side of issue #9. It is not a signed personal opinion or an approval submitted as Abdullah. The existing Accepted decisions remain implemented; no architecture has been replaced.

| ADR | Recommendation and evidence | Trade-off / trigger to revisit |
|---|---|---|
| 0001 modular monolith | Retain. `container.ts` constructs services and adapters; `architecture.test.ts` checks permitted imports; domain tests use memory adapters. The import test cannot establish UML correctness or detect every runtime coupling. | One failure domain. Multiple independently deployed instances would require shared events and concurrency design, not merely adding a broker class. |
| 0002 SSE | Retain for one-way fleet updates. Browser tests now observe position/load/removal, delayed/lost/recovery and session-expired events. `SseHub` sends a snapshot on connection and handles slow consumers. Protocol choice alone does not promise sub-100ms delivery. | Proxy buffering, mobile reconnection and HTTP connection limits need deployment tests. Expiry is enforced, but logout is not full token revocation. Same-process loopback benchmark is not proof of real-user capacity. |
| 0003 SQLite | Retain for the single-process prototype. `database.ts` configures WAL/foreign keys; schema constraints enforce unique active assignments; API tests reopen the file and recover trips/waiting requests. | Synchronous DB calls block the event loop. Actual query latency is data/disk-dependent, not universally microseconds. Load/growth, backup/restore and multiple writers need separate validation. |
| 0008 direct TypeScript | Retain. Node 24.22.1 runs the server and 113 tests; `tsc --noEmit` checks server and test sources. New Playwright tests are dev tooling; Express remains the only direct runtime dependency. | Erasable syntax constraint remains. Browser application JS is still not fully type-checked. UML source consistency is reviewed separately and rendered output is not yet verified. |

## Corrections to earlier wording

The records below now qualify three overclaims: import checking is not exhaustive architecture proof; SSE/WebSocket latency is workload-dependent; SQLite latency is not guaranteed. `engines` specifies a minimum Node version, not an exact Node 24 pin. These are evidence clarifications, not invented new team decisions.

## Team acceptance still outstanding

Zuhair should read these findings and state his actual agreement/disagreement. Abdullah should review demand/privacy/UI ADRs (0004–0007 as applicable to the ownership plan) and his architecture scores. Do not mark issue #9 closed solely because this automated technical review exists. Both people must be able to explain the choices; no signatures, dates of personal review or rubric facts are fabricated.
