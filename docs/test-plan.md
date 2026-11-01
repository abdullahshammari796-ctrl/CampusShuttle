# Test plan and results

## 1. Objectives
Show that the two primary end-to-end flows work, that role restrictions hold, that the real-time path scales, that ETAs and GPS interruption handling behave as specified, and that demand calculations are correct — and record honestly what was *not* tested.

## 2. Levels (V-model pairing, BCS 305 Module 02)

| Level | Verifies | Tooling | Location |
|---|---|---|---|
| Unit | Classes and pure rules: geometry, ETA strategies, signal states, tracker, predictors, backtest, tokens, passwords, event bus; driver-app upload queue and trip ending (browser modules run in Node with a mocked `fetch`); review-package scanner, check interpretation and ZIP format | `node:test` | `test/unit/` |
| Architecture conformance | Component dependency rules of the component diagram — **imports only**; UML operations, attributes, associations and multiplicities are not checked automatically (compared with the code by hand) | `node:test` (static import analysis) | `test/architecture.test.ts` |
| Integration / system | Real HTTP server + SQLite (in memory) + SSE clients; security, use cases, persistence recovery | `node:test`, `fetch`, `node:http` | `test/integration/` |
| Performance | Fan-out latency with 1,000 and 3,000 simulated viewers — a local benchmark (same process, loopback, one shared session, no browsers), not a deployment test | `scripts/load-test.ts` | `docs/evidence/load-test-*.txt` |
| Acceptance | UC1–UC5 in a real browser against a running server | manual, scripted | §5 below, `docs/demo-script.md` |

Time is controlled with a `ManualClock`, so staleness, expiry, session expiry and retention are tested deterministically without waiting.

## 3. Commands
```bash
npm run typecheck     # TypeScript type check (no emit)
npm test              # all automated tests
npm run load-test     # 1,000 viewers × 60 updates (add -- --viewers 3000 --rounds 10)
npm run evaluate      # reproducible demand backtest on synthetic data
```

## 4. Automated test inventory and results

Last full run: 1 Nov 2026, Windows 11, Node 24.14.1 — **103 tests, 103 passed, 0 failed, ≈ 4.7 s** (`docs/evidence/test-run.txt`).

| Area (requirement / scenario) | Tests |
|---|---|
| Role-based access (FR-01, QA-5) | role matrix on all 26 protected endpoints × anonymous/student/driver/office; live stream requires sign-in; an open live stream gets no update after its session expires and is closed (on the next push and on the heartbeat sweep), a fresher session is unaffected, reconnecting with the expired cookie → 401; lockout after 5 failures; session cookie flags and expiry; CSRF header; security headers; malformed input → 400 |
| Run a trip + track (FR-02/03/07/09, UC1/UC2) | start → live position and ETAs → end → removed; one active trip per shuttle and driver (409); only the owning driver can post; driver app: queued positions delivered before the end request, no upload races it, a failed end request (network, 401) keeps the trip active and resumes uploads, 409 = already ended, a stuck queue cannot block ending |
| GPS interruption and recovery (FR-06/18, QA-3/4) | LIVE → STALE → LOST with exact thresholds; no ETAs while lost; recovery on next fix; shuffled offline backlog accepted in order with one push; stale backlog shown as delayed; duplicate rejected; auto-close after 30 min; clock-skew correction; driver upload queue keeps the newest 500 and counts drops; `drain()` waits for the upload in flight |
| ETA behaviour | nominal speed + dwell arithmetic; blended speed fallback, blending and clamping; speed smoothing ignores standing still; no backward jitter; stops reached once, including passed between fixes; lane-correct snapping on a two-way road; corner snapping regression |
| Simultaneous connections (QA-1/2) | 200 concurrent SSE viewers all receive each update within 1 s (measured ≈ 19–21 ms); batch coalescing (one message per viewer); signal changes pushed without polling; waiting counts and arrivals pushed; ended trips removed; disconnected viewers forgotten; slow-client skip and resync |
| Waiting requests (FR-05/19, UC3) | register, idempotent repeat, switch stop, cancel, 404 on second cancel, route-does-not-serve-stop rejected, SERVED on arrival, EXPIRED after 20 min, rate limit (429) |
| Demand calculations (FR-16/17, UC5) | unknown vs zero demand; seasonal and weighted averages with exact values and basis; hour-of-day mean; no forecast without history; no look-ahead; backtest MAE/RMSE/bias/coverage on a hand-computed case; skipped cells reported; forecast API (9 stops × 15 hours, synthetic label); explanation basis; evaluation of 3 models; unknown model → 400 |
| Synthetic data | deterministic per seed; labelled synthetic; within date range; encodes its weekday pattern |
| Office operations (FR-13/14/21, UC4) | terminate requires reason, is audited, driver's next upload gets 409; route validation (colour, speed); out-of-service route refuses trips and disappears for drivers; new route created inactive; audit entries |
| Privacy (FR-20, QA-6) | public views contain no driver identity; student API never returns the pseudonym; pseudonym erased 24 h after closing |
| Persistence and consistency (QA-9) | restart recovery of active trips and waiting requests from the database file; no re-seeding of an existing database |
| Architecture (component diagram) | allowed dependencies only; tracking ↔ demand never import each other; network used through types only; only composition root and seed know persistence |
| Review packaging (CLAUDE.md workflow) | failed, cancelled, empty or timed-out test runs reported as FAILED; skipped checks reported as NOT RUN; tokens found in generated text; allowlist limited to rule + value + path; known local secrets, URL credentials and session tokens redacted from generated text and Git remotes; exact search finds secrets inside binary data; ZIP round trip with CRC-32 |

### Defects found by testing and fixed
1. **Corner snapping** (found by the load test): a tie-break meant for the two lanes of a two-way road also applied to two segments meeting at a corner, placing the shuttle up to ~3 m behind. Fixed in `RoutePath.project`; regression test added.
2. **Work after shutdown** (found by an integration test): the SSE hub's deferred flush could run after the database closed. Fixed: `SseHub.close()` cancels pending work; views are not computed when nobody is connected.
3. **Concurrent simulator start** (found in manual testing): the fleet simulator started two trips in parallel on the same free shuttle; the server correctly answered 409. Fixed in the script (sequential start).
4. **Dialog handling** (found in browser testing): confirmation dialogs relied on the `close` event, which is not delivered while the browser window is hidden. Changed to the synchronous `submit` event.

Found by the independent review (1 Nov 2026), reproduced before fixing:

5. **Driver app ended a trip locally that the server had not ended.** `endTrip()` stopped GPS, discarded the trip and showed the start form *before* the end request, and also when it failed. Reproduced in the browser by making the end request fail: the server still had the trip ACTIVE (signal LIVE) while the driver saw the start form. Fixed with `public/js/trip-ending.js` and `LocationUploader.drain/pause/resume`: queued positions are delivered first (waiting for any upload in flight), new positions are held, and the trip ends on the device only after the server confirms. If the request fails, uploads resume and the driver is told the trip was **not** ended. 8 regression tests.
6. **Live streams outlived their session.** Authorisation was checked only when an SSE stream opened. Reproduced with a test: after the session expired, the stream still received a `vehicle` update. Fixed in `SseHub`: each stream keeps its session expiry, which is checked before every write and by the heartbeat sweep; an expired stream gets `session-expired` and is closed. 2 integration tests plus a token test.
7. **Overstated claims** (documentation): QA-4 promised zero position loss although the queue is bounded and in memory; the load-test results were presented without their method limits. Corrected in the QA scenarios, report, ADRs, slides and demo script.
8. **UML diagrams did not match the code in places.** A member-by-member comparison found, among others: Observer drawn as an interface implemented by `SseHub` (the code uses callbacks); `GpsSource` drawn as a declared interface (it is a duck-typed contract); the hub calling `TrackingService` directly (it calls `LiveView`); the 30-minute auto-close guard worded as "no fix at all"; and hidden fields in the domain model. All 16 sources were corrected; rendering is still pending (§6).
9. **Flaky privacy test** (found when the review-packaging run failed once): "public vehicle views never contain the driver identity" checked that the view JSON did not contain the driver id `d1`, but the view also contains the trip's random UUID, which includes "d1" in roughly one run in eight. Not a privacy leak; the test now uses an id that cannot occur in a UUID and also checks for the driver's display name. Verified with 5 full-suite runs and 30 runs of that test.

## 5. Manual browser verification (acceptance)

Performed on 31 Oct – 1 Nov 2026 in the Chromium-based browser pane of the development environment, against `npm start` with the headless fleet simulator running (`npm run simulate -- --outage`).

| Step | Expected | Observed |
|---|---|---|
| Student signs in, opens map | routes, stops, live shuttles; connection "Live updates" | ✔ two simulated shuttles moving; live badge |
| Student selects Engineering Building | arrivals with minutes, clock time, distance, load, signal | ✔ "Campus Loop · Shuttle 04 — 3 min, at 11:56 PM, 782 m away, Live, Seats available" |
| Student taps "I'm waiting here" | confirmation, map badge "1", toast | ✔; later closed automatically when Shuttle 04 reached the stop (office showed 0 waiting) |
| Driver starts a simulated trip | trip card, next stop, Live | ✔ "Library & Learning Commons, 1 min, 401 m" |
| Simulate network loss ~10 s, restore | positions queued, then delivered in one batch | ✔ "3 queued" → "Delivered 3 queued positions in one batch (3 accepted)" |
| Inject GPS glitch | rejected | ✔ "Server rejected 1 position(s): implausible jump" |
| Reload the driver page | trip resumes | ✔ "Resumed your active trip after a page reload" |
| Simulate GPS outage ~30 s | passengers see "Location delayed"; recover on restore | ✔ pill changed to "Location delayed"; back to "Live" after restore |
| End trip (confirm dialog) | trip ends, shuttle removed | ✔ |
| Office live view | KPIs, map, waiting per stop, active trips with drivers | ✔ including a "GPS lost" shuttle from the simulator's outage window (grey marker) |
| Office forecast, explanation, trends, backtest | data shown with synthetic-data warning | ✔ explanation listed 4 previous Saturdays with counts 4, 1, 1, 7 → 3.3 |
| Office routes, trip history, track, system | data shown; track statistics show the outage gap | ✔ track: 26 positions, 637 m, longest gap 42 s, 1 gap over threshold |
| Office ends a trip with a reason | audited; driver informed | ✔ audit entry "trip.terminate — Demo: vehicle breakdown reported by phone" |

Re-verified on 1 Nov 2026 after the review fixes (fresh server, fleet simulator running with `--outage --outage-at 20 --outage-for 75`):

| Step | Expected | Observed |
|---|---|---|
| Driver: *Simulate network loss*, then *End trip* | trip **not** ended; message; trip card stays; positions keep queueing | ✔ "Trip NOT ended: Cannot reach the server (simulated network loss)…"; server trip still ACTIVE/LIVE; "Offline (simulated) / 3 queued" |
| Restore network, then *End trip* | queue delivered, trip ends | ✔ "Delivered 5 queued positions in one batch (5 accepted)", then "Trip ended."; server: no active trip |
| Same as the original reproduction: end request fails at the network level (patched `fetch`) | trip stays active | ✔ "Trip NOT ended: Cannot reach the server…"; server ACTIVE; retry after restoring → ended |
| Driver: *Simulate GPS outage* (timed from the press) | Delayed after ~20 s, Lost after ~60 s with no ETAs, Live on restore | ✔ STALE at 21 s, LOST at 61 s (0 ETAs), LIVE within 1 s of restore |
| Simulator outage logging | start/end printed with times | ✔ "GPS outage STARTED for 75 s …" at 01:59:57, "ENDED" at 02:01:12 |
| Student: live map, stop selection, arrivals, waiting request | live badge; arrivals; abandoned shuttle shown as delayed | ✔ "Live updates"; two arrivals; the shuttle whose driver page had closed showed "Location delayed ~7 min"; request registered ("1 person is waiting here") |
| Office: live operations, system, forecast, remote end | KPIs; stream counters incl. session expiry; audited end | ✔ 3 shuttles, 1 GPS problem, 1 waiting; "… 0 closed at session expiry"; forecast with synthetic-data banner; audit "trip.terminate — Walkthrough: driver page closed, GPS lost" |

## 6. Not tested (known gaps)
* Real phone GPS on a moving vehicle (only the simulator and the API were exercised).
* Browsers other than Chromium; small-screen phones beyond the responsive layout check; screen readers.
* Automated UI tests (the browser code was verified manually).
* Load beyond 3,000 viewers; long-running (multi-day) operation; database growth over a semester.
* **UML rendering.** On 1 Nov 2026 the official `plantuml-mit` 1.2026.9 jar was downloaded from Maven Central and its SHA-1, SHA-256 and SHA-512 matched the published checksums. Running it (Java 21 from the DataGrip installation) was refused by the authoring environment's permission policy, so no diagram has been rendered or syntax-checked by a real renderer, and the PDFs still show placeholders. See README "Rendering the UML diagrams".
* Session expiry in a real browser (the 8-hour lifetime is not configurable; covered by the deterministic integration test with a manual clock).
* HTTPS deployment.
