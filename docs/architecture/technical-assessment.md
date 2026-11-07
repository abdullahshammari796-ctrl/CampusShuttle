# Technical assessment: architecture options A–D and ADR-0001 to 0008

**Status (6 November 2026).** This is a technical assessment produced from the repository evidence with the tool declared in the AI-use statement (`docs/team/ai-use-statement.md`). It is **not** either student's personal scoring or opinion. Abdullah's and Zuhair's own judgements (issues #2 and #9) are recorded separately, in the private team-facts form, and have not been supplied yet. The course allows AI help only with disclosure, and the instructor may ask either member to defend any decision. Both members therefore need to check this reasoning and be able to explain it, or change it, before relying on it.

It replaces the 1 November draft scores in report §6.3. The changes and the reason for each are listed in §1.4.

## 1. Options A–D against the architectural drivers

### 1.1 Drivers and weights
The drivers come from report §6.1 and the quality-attribute scenarios (`docs/architecture/quality-attribute-scenarios.md`). Weight 3 marks the drivers that decide whether the system is useful at all; weight 1 marks a future possibility.

| Driver | Weight | Why this weight |
|---|---|---|
| Freshness and fan-out (QA-1, QA-2) | 3 | The proposal's hard quality attribute: one update must reach every viewer within 1 s (p95). |
| Robustness to GPS and network loss (QA-3, QA-4) | 3 | The other half of the hard attribute: honest information when positions stop. |
| Security and privacy (QA-5, QA-6) | 2 | Location and identity data; UAE PDPL; the brief asks how personal data is protected. |
| Modifiability and testability (QA-7, QA-8) | 2 | ETA and forecasting methods are expected to change once real data exists. |
| Operational simplicity for a team of two | 3 | A project constraint: two students, no paid services, a laptop demonstration. |
| Growth beyond one campus | 1 | Not required; kept as a tie-breaker. |

### 1.2 Scores (1 = poor, 5 = excellent) and reasons

| Driver (weight) | A Modular monolith + SSE | B Microservices + broker | C Monolith + polling | D Serverless BaaS |
|---|---|---|---|---|
| Freshness & fan-out (3) | **5**: push on every update. **Measured**: local benchmark with 1,000 simulated viewers, p95 35–37 ms (`docs/evidence/load-test-1000*.txt`). | **4**: push as well. Gateway and broker add hops of milliseconds, not seconds, so QA-1 is still reachable; not built, not measured. | **2**: with polling every *t* seconds, data is on average *t*/2 old and up to *t* old. Meeting p95 ≤ 1 s needs roughly 1 s polling, which is 1,000–3,000 requests/s for 1,000–3,000 viewers even when nothing moves (arithmetic, not measured). | **4**: hosted real-time databases push changes. But each upload must run a cloud function to compute ETAs, and cold starts can add seconds; not measured. |
| Robustness to loss (3) | **4**: store-and-forward in the driver page; the signal state machine runs on the server clock (`src/tracking/signal-state.ts`); restart recovery is tested. One process is a single point of failure. | **4**: failures are isolated per service, but there are more failure modes (broker, gateway, network partitions between services). | **4**: the same server-side signal states and driver queue are possible; polling recovers from a dropped viewer connection on the next request without reconnection logic. | **3**: the 20 s / 60 s transitions happen when *no* event arrives. They need either client-side computation or a scheduler, and common cron-style schedulers run at one-minute granularity. |
| Security & privacy (2) | **4**: one trust boundary and one access-control layer (`src/web/middleware.ts`); data stays on a campus machine. | **3**: more network surface and service-to-service authentication to get right. | **4**: same as A. | **2**: driver locations and student activity are stored by a third party, possibly outside the UAE, which complicates data minimisation and the PDPL's cross-border rules. |
| Modifiability & testability (2) | **4**: ports, a composition root and an import-rule test (`test/architecture.test.ts`); a fourth predictor was added in PR #12 as one class plus one line in `src/container.ts`. Manual UML upkeep is a cost. | **3**: independent deployment, but a change crossing services needs coordinated releases and contract tests. | **4**: the transport (polling) says nothing about module structure; the same ports and tests are possible. Request/response is, if anything, simpler to test than long-lived streams. | **3**: logic is split between client code and vendor functions; local testing needs emulators. |
| Operational simplicity (3) | **5**: `npm install && npm start`, one database file. | **1**: five or more deployables, a broker and a gateway for two students. | **5**: same as A. | **3**: no server to run, but vendor accounts, quotas, keys and lock-in; an offline demonstration is hard. |
| Growth beyond one campus (1) | **3**: scales vertically; `EventPublisher` is the seam for a shared broker (ADR-0002). | **5**: scales each service independently. | **3**: stateless polling servers scale out behind a load balancer and caches, at the cost of request volume. | **5**: the vendor scales it. |
| **Weighted total (max 70)** | **61** | **44** | **52** | **45** |

Totals: A = 15 + 12 + 8 + 8 + 15 + 3; B = 12 + 12 + 6 + 6 + 3 + 5; C = 6 + 12 + 8 + 8 + 15 + 3; D = 12 + 9 + 4 + 6 + 9 + 5.

### 1.3 Uncertainty and sensitivity
* **What is measured.** Only A's freshness (a same-process loopback benchmark, not real phones on campus Wi-Fi) and the restart recovery of A. C's request load is arithmetic. Every score for B, C and D, which were not built, is judgement.
* **A against C.** The two options differ only in freshness: A 5 × 3 = 15, C 2 × 3 = 6. Without that driver both total 46. The choice of push over polling therefore rests entirely on QA-1's one-second requirement. If the office accepted information a few seconds old, a polling monolith would be as good and simpler to scale out.
* **Robustness to scoring errors.** A leads C by 9 points. A single one-point change moves a total by at most 3, so at least three such changes in C's favour are needed to tie. A leads D by 16 and B by 17.
* **Weights.** With equal weights the totals are A 25, C 22, B 20 and D 20. Raising "growth" from 1 to 3 gives A 67, C 58, D 55 and B 54. A stays first in both cases.
* **What would change the decision.** Several campuses or server instances (then a broker behind `EventPublisher`, or B); a relaxed freshness requirement (then C); a university mandate for a hosted platform with UAE data residency (then D becomes viable for security).

### 1.4 Changes from the 1 November draft
| Cell | Draft → now | Reason |
|---|---|---|
| C modifiability | 3 → 4 | The draft said polling "tends towards a big ball of mud". Polling is a transport choice; it does not determine module structure. |
| C robustness | 3 → 4 | Staleness can be computed on the server in C as well; polling needs no reconnection logic. |
| C growth | 2 → 3 | Stateless polling servers scale out easily; their cost is request volume. |
| D freshness | 5 → 4 | Not measured; per-upload cloud functions can add cold-start delays. |
| D robustness | 4 → 3 | The time-driven 20 s / 60 s transitions need a client-side or scheduled mechanism. |
| D security text | — | The draft cited "the brief's preference for no cloud subscriptions". The official brief has no such preference; it is this project's own constraint. |

Totals changed from A 61, B 44, C 46, D 51 to A 61, B 44, C 52, D 45. The decision (A) stands.

## 2. ADR-0001 to 0008

Every pointer below was checked against the code on `main` at `695eb88`. "Retain" means the evidence still supports the decision. It is not a personal agreement by either member.

### ADR-0001 Modular monolith with ports and adapters
* **Rationale.** The simplest structure that meets every driver (§1). Eight component folders under `src/`; `src/container.ts` is the only place that creates concrete classes.
* **Alternatives.** Microservices (B), a plain MVC monolith, BaaS (D).
* **Trade-offs.** Lowest latency and simplest operation, against a single failure domain and vertical scaling only.
* **Evidence.** `test/architecture.test.ts` (`ALLOWED` map) fails on a forbidden import; domain tests run with in-memory adapters; PR #12 added a predictor without touching `DemandService` (QA-7 exercised).
* **Limitations.** The import test does not check runtime coupling or the UML; a second instance needs a shared event channel *and* a design for concurrent writers, not just a broker class.
* **Assessment.** Retain. Revisit for several campuses or independent release cycles.

### ADR-0002 Server-Sent Events for live updates, REST for uploads
* **Rationale.** Traffic is one-way; EventSource reconnects by itself and sends the session cookie.
* **Alternatives.** Polling (C's transport), WebSockets.
* **Trade-offs.** Simple, proxy-friendly HTTP, against about six connections per origin on HTTP/1.1 and buffering proxies.
* **Evidence.** `src/realtime/sse-hub.ts`: a snapshot on connect, `X-Accel-Buffering: no`, heartbeats, the slow-client limit (`maxBufferedBytes`, 256 KB and 15 s heartbeats in `src/config.ts`), session expiry checked before every write. Integration tests in `test/integration/realtime.test.ts`; browser tests observe delayed, lost and recovery; the local benchmark.
* **Limitations.** The benchmark is same-process loopback; real campus networks and proxies are untested; logout does not revoke a token early.
* **Assessment.** Retain. Revisit if bidirectional messages (e.g. driver chat) become a requirement.

### ADR-0003 SQLite through `node:sqlite`
* **Rationale.** Transactions and real constraints with zero installation.
* **Alternatives.** PostgreSQL, in-memory only, `better-sqlite3`.
* **Trade-offs.** Simplicity, against an experimental Node module, a single writer and synchronous calls on the event loop.
* **Evidence.** `src/persistence/database.ts`: foreign keys on, WAL for file databases, `PRAGMA user_version` migrations, partial unique indexes `ux_trips_active_shuttle`, `ux_trips_active_driver` and `ux_waiting_active` (QA-9); restart-recovery tests.
* **Limitations.** Growth over a semester, backup and restore, and slow disks are untested.
* **Assessment.** Retain for one campus. Revisit for several instances (PostgreSQL adapters behind the same repository ports).

### ADR-0004 Server-side ETAs and an explicit GPS-signal state machine
* **Rationale.** One consistent number for every student, and "no estimate" instead of a wrong one when GPS stops (QA-3).
* **Alternatives.** ETAs computed in each browser; a timetable fallback when GPS is lost.
* **Trade-offs.** Honesty over coverage: a lost shuttle shows "last seen", not a guess.
* **Evidence.** `src/tracking/signal-state.ts` (four state classes); `src/tracking/trip-tracker.ts` (110 km/h jump limit, 1 s minimum interval, accuracy limit from configuration); clock-skew correction from `sentAt`. The 6 November walkthrough observed "delayed" 19 s and "lost" 59 s after the GPS stopped, and recovery 2 s after it resumed (`docs/evidence/walkthrough-2026-11-06.txt`).
* **Limitations.** The 20 s / 60 s thresholds were chosen for the simulator's 3 s interval and are not field-tested. The walkthrough also showed that a driver page in a background browser tab stopped sending after about five minutes, because browsers throttle hidden pages; a phone with its screen off can behave the same way.
* **Assessment.** Retain. Tune the thresholds only from a real field test (issue #3).

### ADR-0005 Explainable baseline forecasts; no trained model yet
* **Rationale.** No real history exists; the ML lifecycle puts feasibility before modelling.
* **Alternatives.** Gradient boosting or a neural network trained on synthetic data; no forecasting.
* **Trade-offs.** Explainability and honesty, against modest accuracy. The synthetic numbers prove only that the pipeline works.
* **Evidence.** Four predictors registered in `src/container.ts`; synthetic data labelled in the database, API and UI; `npm run evaluate` reproduces MAE 1.45 / 1.44 / 1.42 / 1.98.
* **Limitations.** Waiting requests measure expressed demand only.
* **Assessment.** Retain. Revisit after a semester of real requests: a trained model must beat the seasonal baseline on held-out real weeks.

### ADR-0006 Signed HttpOnly session cookies and role checks at the edge
* **Rationale.** Works with EventSource; tokens are unreadable by page scripts.
* **Alternatives.** JWT in localStorage, a server-side session table, university SSO.
* **Trade-offs.** Signed tokens avoid a server-side session-record lookup, but authentication still checks on every request that the user account exists (`AuthService.authenticate` calls `users.get`). The cost is that logout cannot revoke a copied token before it expires.
* **Evidence.** `src/identity/password-hasher.ts` (salted scrypt); HMAC-signed tokens; `src/web/middleware.ts` (CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, the `X-Requested-With: campus-shuttle` check); role matrix of 26 endpoints × 4 caller types in `test/integration/api.test.ts`.
* **Limitations.** Logout cannot revoke a copied token; demo passwords are public.
* **Assessment.** Retain for the prototype. Before any deployment: SSO or a revocation list, `SECURE_COOKIES=true` behind HTTPS, and no demo accounts.

### ADR-0007 Offline schematic SVG map
* **Rationale.** No tile provider, no third-party requests, works offline.
* **Alternatives.** Third-party tiles, self-hosted tiles.
* **Trade-offs.** Privacy and offline operation, against no streets or buildings.
* **Evidence.** `public/js/map.js` draws from route geometry; the CSP blocks external requests; keyboard-operable stop buttons and map-layout checks in `e2e/accessibility.spec.ts`.
* **Limitations.** Users unfamiliar with the campus may not orient themselves on a schematic.
* **Assessment.** Retain. Revisit if users cannot orient themselves (self-hosted tiles behind the same component).

### ADR-0008 TypeScript run directly by Node 24, no build step
* **Rationale.** Checked interfaces without a build pipeline that could fail during the demonstration.
* **Alternatives.** A bundler with a framework; plain JavaScript.
* **Trade-offs.** No enums, namespaces or parameter properties; browser code is not type-checked.
* **Evidence.** `tsconfig.json` (`erasableSyntaxOnly`); `npm run typecheck`; Express is the only runtime dependency.
* **Limitations.** `node:sqlite` and type stripping tie the project to Node ≥ 22.18 (24 used for verification).
* **Assessment.** Retain.

## 3. What this assessment does not do
It does not record Abdullah's or Zuhair's agreement, their own scores, or a team decision. It does not measure options B, C or D. It does not replace the field test (issue #3), the screen-reader session (#8) or the team's paper inspection of the diagrams (#1).
