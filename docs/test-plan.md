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
| Browser (end to end) | Role workflows, UC1–UC5 steps and extensions, accessibility of the student, driver and office pages (axe WCAG tags, keyboard) and driver location-source resumption, each against a fresh in-memory server with a controllable server clock | Playwright 1.64.1, Chromium | `e2e/` |
| Acceptance | UC1–UC5 in a real browser against a running server | manual, scripted | §5 below, `docs/demo-script.md` |

Time is controlled with a `ManualClock`, so staleness, expiry, session expiry and retention are tested deterministically without waiting.

## 3. Commands
```bash
npm run typecheck     # TypeScript type check (no emit)
npm test              # all automated tests
npm run load-test     # 1,000 viewers × 60 updates (add -- --viewers 3000 --rounds 10)
npm run evaluate      # reproducible demand backtest on synthetic data
npm run test:browser  # Chromium tests (first: npx playwright install chromium)
npm run uml:check     # rendered UML exports well-formed / fully decoded, unclipped and from the current sources
```

## 4. Automated test inventory and results

Current run (10 Nov 2026, branch `abdullah/submission-package` from `main` at `e989b97`, Windows 11, Node 24.14.1): **119 Node tests, 119 passed, 0 failed** (`docs/evidence/test-run.txt`). Browser tests: **25 Chromium tests, 25 passed** in one full run on 7 Nov (`docs/evidence/browser-test-run.txt`); the submission pass changed no application code, and the `verify` check runs them again on the pull request. The same checks run in GitHub Actions (`verify`) on every pull request to `main`. Earlier browser runs: the PR #15 work recorded two consecutive full runs (22/22); PR #16 and Zuhair's review of it each recorded one full run (22/22).

Historical baseline run: 1 Nov 2026, Windows 11, Node 24.14.1 — **103 tests, 103 passed, 0 failed, ≈ 4.7 s** (before PRs #12 and #13).

| Area (requirement / scenario) | Tests |
|---|---|
| Role-based access (FR-01, QA-5) | role matrix on all 26 protected endpoints × anonymous/student/driver/office; live stream requires sign-in; an open live stream gets no update after its session expires and is closed (on the next push and on the heartbeat sweep), a fresher session is unaffected, reconnecting with the expired cookie → 401; lockout after 5 failures; session cookie flags and expiry; CSRF header; security headers; malformed input → 400 |
| Run a trip + track (FR-02/03/07/09, UC1/UC2) | start → live position and ETAs → end → removed; one active trip per shuttle and driver (409); only the owning driver can post; driver app: queued positions delivered before the end request, no upload races it, a failed end request (network, 401) keeps the trip active and resumes uploads, 409 = already ended, a stuck queue cannot block ending |
| GPS interruption and recovery (FR-06/18, QA-3/4) | LIVE → STALE → LOST with exact thresholds; no ETAs while lost; recovery on next fix; shuffled offline backlog accepted in order with one push; stale backlog shown as delayed; duplicate rejected; auto-close after 30 min; clock-skew correction; driver upload queue keeps the newest 500 and counts drops; `drain()` waits for the upload in flight |
| ETA behaviour | nominal speed + dwell arithmetic; blended speed fallback, blending and clamping; speed smoothing ignores standing still; no backward jitter; stops reached once, including passed between fixes; lane-correct snapping on a two-way road; corner snapping regression |
| Simultaneous connections (QA-1/2) | 200 concurrent SSE viewers all receive each update within 1 s (measured ≈ 19–21 ms); batch coalescing (one message per viewer); signal changes pushed without polling; waiting counts and arrivals pushed; ended trips removed; disconnected viewers forgotten; slow-client skip and resync |
| Waiting requests (FR-05/19, UC3) | register, idempotent repeat, switch stop, cancel, 404 on second cancel, route-does-not-serve-stop rejected, SERVED on arrival, EXPIRED after 20 min, rate limit (429) |
| Demand calculations (FR-16/17, UC5) | unknown vs zero demand; seasonal and weighted averages with exact values and basis; hour-of-day mean; six-week median including outliers, even/odd counts, zero-covered days and missing weeks; no forecast without history; no look-ahead; backtest MAE/RMSE/bias/coverage on a hand-computed case; skipped cells reported; forecast API (9 stops × 15 hours, synthetic label); explanation basis; evaluation of 4 models (Node 24 verification below); unknown model → 400 |
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
8. **UML diagrams did not match the code in places.** A member-by-member comparison found, among others: Observer drawn as an interface implemented by `SseHub` (the code uses callbacks); `GpsSource` drawn as a declared interface (it is a duck-typed contract); the hub calling `TrackingService` directly (it calls `LiveView`); the 30-minute auto-close guard worded as "no fix at all"; and hidden fields in the domain model. All 16 sources were corrected on 1 Nov 2026. (Rendering followed on 2 Nov 2026; see §6.)
9. **Flaky privacy test** (found when the review-packaging run failed once): "public vehicle views never contain the driver identity" checked that the view JSON did not contain the driver id `d1`, but the view also contains the trip's random UUID, which includes "d1" in roughly one run in eight. Not a privacy leak; the test now uses an id that cannot occur in a UUID and also checks for the driver's display name. Verified with 5 full-suite runs and 30 runs of that test.

Found in the owner review of PRs #12 and #13 (1 Nov 2026; items 10–13), in the first UML render (item 14), in a failed browser run on 2 Nov 2026 (item 15), in Zuhair's review of PR #15 (item 16), in the final completion pass of 6–7 Nov 2026 (items 17–18), in Zuhair's review of PR #17 (item 19) and in the submission pass of 10 Nov 2026 (items 20–21). The regression evidence differs by item, so each item names its own baseline:
* items 10 and 11: tests that fail on commit `f62b472` (`npx playwright test` and `node --test`, 1 Nov 2026);
* item 12: `npm audit`;
* item 13: reading the sources against the code;
* item 14: tests that reproduce the failure kinds Zuhair's render reported (no separate run against the old script was recorded);
* item 15: the new Chromium test, run with the fix temporarily removed (2 Nov 2026);
* item 16: tests that fail on the validator from commit `87aceaf` (`docs/evidence/uml-validator-regression.txt`);
* item 17: the new Chromium tests, run against the unfixed `public/` files of `main` at `695eb88` (`docs/evidence/accessibility-office-2026-11-06.txt`);
* item 18: text sizes measured from the built HTML; there is no automated test of print size;
* item 19: reading the documents against the code and this test plan; documentation only, no automated test;
* item 20: reading diagram A.4 against the Week 6 notation guidance and the driver routes; no automated test;
* item 21: text sizes measured from the built HTML and every page of the UML-set PDF inspected; no automated test of print size.

The fixes for items 10–16 were made in the owner pull requests #14 and #15, for items 17–19 in the final completion pull request (#17), and for items 20–21 in the submission pull request:

10. **A reloaded device-GPS trip switched to simulated positions.** `driver.js` always restarted the simulator after a reload, so a real trip would have uploaded fabricated positions. Fixed: `GET /api/driver/trip` returns `locationSource` (the source of the latest accepted position, also after a server restart). The page resumes that source; when it is unknown, it shares nothing until the driver chooses. Tests: `e2e/driver-location-source.spec.ts` (2), `api.test.ts` "tells a reloaded driver page which location source its trip is using", and a restart assertion.
11. **Waiting-count refresh amplification.** Every student waiting at a stop re-fetched their own request whenever anyone joined that stop. With K students waiting, each join cost about K requests (5 extra requests for 5 joins in the test). Fixed: the page re-fetches only when the stop's count falls. Test: `e2e/use-cases.spec.ts` "UC3: other students joining the same stop do not make a waiting student re-fetch its request".
12. **Development-dependency advisories** (found by `npm audit`, not by a test): two high-severity `image-size` advisories through the deck builder `pptxgenjs`. Resolved with an npm override to the patched `image-size` 2.x. `pptxgenjs` never loads that package, and a rebuilt deck is structurally identical. `npm audit` now reports 0 vulnerabilities in all dependencies.
13. **UML sources drifted from the code** (found by a second member-by-member comparison, by reading only; nothing was rendered):
    * 08: `TrackingService` lacked `lastFixSource`, `isShuttleBusy` and `signalSummary`, its `AuditLog` dependency and `Route.updatedAt`; `terminateTrip`'s reason is `unknown`; `VehicleView.position` can be null and `signal` has `etaConfidence`.
    * 04: `trip.location` is published before `trip.signal`.
    * 02: the vehicle update is queued and sent on the next event-loop turn, after waiting requests are closed; the driver chooses the location source, and a reload resumes it.
    * 05: a recovered trip without a stored position stays AwaitingFix and is re-evaluated immediately.
    * 10: the user, network and audit ports belong to identity, network and shared respectively.
    * 07: an association label was split across two lines (a likely syntax error).
    * Optional parameters, nullable fields and `unknown` inputs were corrected in 09, 12, 14 and 16, and `login.js` was added to 11.
    * Diagrams 01, 03, 06, 13 and 15 were consistent.
14. **The UML render script accepted broken exports** (found when Zuhair first rendered the sources, 1 Nov 2026). It only checked that files existed: PNGs 03 and 06 were empty after a successful run, and PNGs 08 and 09 were clipped at PlantUML's default 4096 px limit. Fixed:
    * `npm run uml` checks the jar's SHA-256 and renders into a fresh temporary folder with `PLANTUML_LIMIT_SIZE=8192`.
    * It checks every SVG and PNG and requires each PNG to match its SVG's size within 1 px. As first written, that check was itself too shallow; see item 16.
    * It records source and export hashes in `docs/uml/out/manifest.json`.
    * `npm run uml:check` (also in CI and in `npm run docs:build`) reports missing, empty, corrupt, clipped, stale and orphaned exports.
    * Tests: `test/unit/uml-exports.test.ts` (3), each reproducing one of these failures. The stale check also caught a real case: the adapter note was edited after rendering.
15. **The sign-in form could put the password into a URL** (found because one full browser run failed on 2 Nov 2026). The test clicked *Sign in* before `login.js` had attached its submit handler, so the browser submitted the form natively as a GET request: `/?username=…&password=…`. A real user who pressed Enter on a slow connection could do the same, leaving credentials in the browser history. Fixed:
    * the form uses `method="post"`;
    * the button stays disabled until the script has attached its handler, which also removes the test's race.

    Test: `e2e/roles.spec.ts` "the sign-in form never puts credentials into a URL, even before its script has run" (JavaScript disabled). It fails without the fix.
16. **The new export validator accepted malformed content** (found in Zuhair's [review of PR #15](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15#pullrequestreview-5730257445)). From committed diagram 01 the review made two broken exports: an SVG with an unmatched `<g>`, and a PNG whose first scanline filter is 5 (valid values are 0–4), with recomputed CRCs. The old `svgSize` and `pngSize` accepted both, `inspectDiagram` reported no problem, and `checkExports` returned nothing when given a manifest whose hashes matched. Fixed:
    * SVGs are parsed with `@xmldom/xmldom`, and any parser error or warning rejects the file.
    * PNGs are decoded completely: chunk order and CRCs, exact data length, every filter type, and every palette index after reconstructing each scanline. Only PlantUML's 8-bit, non-interlaced encodings are accepted; others are rejected.
    * `recordDiagram` validates before recording.

    Tests in `test/unit/uml-exports.test.ts`: "rejects well-wrapped exports whose content does not parse or decode", and "refuses to record malformed exports, and the manifest check rejects them even when their hashes match". On the old validator the first fails with "Missing expected exception" and the second because `checkExports` returned `[]`. The reviewer's reproducer now stops at the first rejection.
17. **The office page failed WCAG checks and kept the forecast explanation from keyboard users** (found in the 6 November walkthrough and the first automated scan of the office page, which the PR #13 checks did not cover):
    * the forecast heat-map cells were `<td>` elements with only a click handler, so UC5 step 3 needed a mouse;
    * white numbers on the mid-blue cells reached about 3.6:1 contrast (small text needs 4.5:1), and one dark-mode ramp colour could not reach 4.5:1 with either ink;
    * at phone width, the history, backtest and audit tables scrolled sideways but no key could reach them.

    Fixed: cell buttons with accessible names; ink chosen by computed contrast and the ramp colour replaced; focusable, named table regions; a polite live region for the explanation. Tests in `e2e/accessibility.spec.ts`: "office light/dark: automated WCAG checks on every tab at phone width" (with one audited change, so the audit table has a real row) and "office can open a forecast explanation (UC5 step 3) using only the keyboard". All three fail on the unfixed files.
18. **The separate UML-set PDF printed some text at 5.5 pt** (found by measuring the build: A.5's 11 px labels at 67 %, A.15 at 62 %, A.9 at 63 %). The brief asks for that PDF "at full readable size". Fixed in `scripts/build-docs.ts`: in the UML-set PDF each diagram is enlarged towards a 7 pt minimum, but never cut horizontally into more rows of pages than before, because a class box split across pages is harder to read than smaller text. Nine diagrams now reach 6.9 pt or more (five before); the smallest text is 5.7 pt (A.9's stereotype labels, limited by the A4 page). The report's Appendix A keeps its layout. The page inspection also found that two interface labels in A.11 ("WaitingRequest & DemandHistory repositories" and "UserRepository") were drawn over each other; the source now breaks them over several lines, and diagram 10 was re-rendered with the verified jar (the other 15 exports re-rendered byte-identical). Details: `docs/evidence/uml-inspection-2026-11-06.txt`.
19. **Four statements in the final-pass documents were wrong or inconsistent** (found in Zuhair's review of PR #17 at `1a21cc6`; the review was supplied as a package on 7 Nov 2026 and was not posted on GitHub):
    * the technical assessment said ADR-0006 needs "no lookup per request", although `AuthService.authenticate` looks up the user account after verifying every token (`src/identity/auth-service.ts`); only a server-side *session-record* lookup is avoided;
    * the speaking script said all 18 items were "fixed with regression tests", although items 12, 13 and 18 were checked by an audit, a source comparison and a measurement;
    * the script's slide times added up to 12:30, its total row said 12:00 and its speaker totals to 11:30;
    * slide 13 listed "sign-on" as missing, although the prototype has sign-in; university single sign-on is what is missing.

    Corrected in the technical assessment, the speaking script (one consistent 12:00 budget, with 8- and 15-minute versions that add up), the runbook and the deck. No code was changed.
20. **The system sequence diagram modelled two actors** (found by checking A.4 against the Week 6 sheet, part 3: one actor on the left, the system as one box, messages as operations with parameters). A.4 combined UC2 (Driver) and UC1 (Student). It is redrawn as the main success scenario of UC2 *Run a trip* only: the Driver is the only actor, `:Campus Shuttle System` is one box, and twelve numbered messages name the system operations with their parameters, matching the driver routes in `src/web/routes/driver-routes.ts` and the replies they return. Position uploads and the trip poll are two loops in a `par` fragment; the load report is an `opt` fragment. The student's side stays in UC1 (A.2) and in A.5.
21. **The separate UML-set PDF still printed text below 7 pt** (item 18 had left A.3–A.6, A.8–A.10 and A.14 at 5.7–6.9 pt). Fixed:
    * Sources: the class diagrams' stereotype labels («record», «repository» …) and the guard texts of A.5's fragments were enlarged from 11–12 px to 13 px. A.5's participant names and longest messages were broken over several lines, so it is 1,365 px wide instead of 1,799 px. No element, attribute, operation, association, multiplicity or message was removed or renamed.
    * `scripts/build-docs.ts`: where overlapping detail pages cannot reach 7 pt, a diagram is split recursively, only along empty lines that no text, box or class crosses. Where a class diagram has no such line, overlapping page windows each show whole classes, and a class cut by a page edge is faded on that page. The overview page outlines and numbers each detail. A.6 now gets a full page of its own instead of a 6.9 pt page with its heading.
    * Result: every diagram's smallest text prints at about 7 pt in the UML-set PDF. It measures 7.0 pt or more in the built HTML, and about 6.93 pt on some detail pages in the PDF itself (Zuhair's review of PR #18). The report's Appendix A keeps its layout, and its smallest annotations now print at 6.1 pt instead of 5.5 pt, because the labels are larger. Details: `docs/evidence/uml-inspection-2026-11-10.txt`.

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
| Reload the driver page | trip resumes | ✔ "Resumed your active trip after a page reload" (since the owner review it also names the resumed location source; automated in `e2e/driver-location-source.spec.ts`) |
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

Third walkthrough, 6 November 2026, 23:35–23:51: a fresh demonstration database, the fleet simulator with `--outage --outage-at 30 --outage-for 75`, three sessions in separate browser tabs. Driven by the tool declared in the AI-use statement, not by a team member; positions simulated. Details and times: `docs/evidence/walkthrough-2026-11-06.txt`.

| Step | Expected | Observed |
|---|---|---|
| UC1 step 5: a shuttle on the loop reaches the student's stop | next-lap estimate, list re-sorted | ✔ Shuttle 01 at Library "8 m · Now" (23:45:41), then "2,390 m · 8 min" (23:45:44) and re-sorted; loop length computed as 2,389 m |
| UC3 step 4: waiting request served | closed when a matching shuttle arrives | ✔ "A shuttle reached Library & Learning Commons at 11:44 PM and your request was closed" |
| UC4 step 2: historical trace of an ended trip | positions, distance, duration, gaps | ✔ 214 positions, 4.2 km, 12 min 35 s, longest gap 1 min 15 s, 2 gaps over the stale threshold; gap drawn dotted |
| GPS outage, timed from the press | delayed ≤ 22 s, lost ≤ 62 s, recovery on next fix | ✔ delayed 19 s, lost 59 s (no estimate), Live 2 s after restore |
| Network loss, end trip, restore | trip not ended; queue delivered | ✔ "Trip NOT ended…"; "Delivered 7 queued positions in one batch (7 accepted)" |
| UC5 step 3 with the keyboard | explanation reachable | ✘ heat-map cells not focusable → fixed (item 17) |
| Driver page left in a background tab | positions continue | ✘ stopped after about 5 min (browser throttling), resumed when shown; server showed "delayed" meanwhile. Not a code defect; the demo runbook now keeps the driver window visible |

## 6. Not tested (known gaps)
* Real phone GPS on a moving vehicle (only the simulator and the API were exercised).
* Browsers other than Chromium; physical phones (only emulated 390 px viewports were used).
* Screen readers. No screen reader whose output can be observed was available for the 6–7 November pass: NVDA (which has a speech viewer) is not installed, and Windows Narrator's speech cannot be captured by the tools used. Automated axe scans and the accessibility tree are not a screen-reader session.
* A driver page in the background: on 6 November the simulated driver stopped sending after about five minutes in a background tab (browser timer throttling). Behaviour on a phone with its screen off is untested (issue #3).
* Load beyond 3,000 viewers; long-running (multi-day) operation; database growth over a semester.
* **UML rendering — history and status.**
  * On 1 Nov 2026 the authoring environment twice refused to run the checksum-verified `plantuml-mit` 1.2026.9 jar.
  * On 1 Nov 2026, Zuhair's review rendered all 16 unchanged sources (Java 17, Linux). That run exposed the export-checking defect (item 14).
  * On 2 Nov 2026, with Abdullah's explicit authorisation, the same jar rendered all 16 sources on Windows (Java 21) through the validating `npm run uml`; the committed exports come from this run.
  * On 6–7 November the pages of both PDFs were inspected on screen by the tool declared in the AI-use statement (`docs/evidence/uml-inspection-2026-11-06.txt`), and the separate UML-set PDF was enlarged (item 18).
  * On 7 November diagram 10 was re-rendered with the same verified jar after the label fix in item 18.
  * Not yet done: the team's own inspection of every diagram, and any check on paper (issue #1). An on-screen inspection does not show that the pages are readable when printed.
* Session expiry is now covered in Chromium with the server clock advanced; a real eight-hour soak remains untested.
* HTTPS deployment.

## Issue #6 — same-weekday median extension (1 November 2026)
* Added six unit tests: outlier resistance (including even-number median), odd sample sizes, covered zeros vs unknown weeks, insufficient history, no future/other-stop/other-hour leakage, and a hand-checked rolling-origin backtest.
* Independent local check with Node 22.16.0: predictor suite **16/16 passed** and all runnable unit/architecture tests **84/84 passed** (see `docs/evidence/issue-6-local-tests.txt`). This is not the project's required Node 24 environment and does **not** include integration tests or TypeScript checking.
* Reproduced baseline synthetic backtest figures by importing the same generator and backtest modules directly, then added the median results (MAE 1.42, RMSE 2.01, bias −0.22, 83% range coverage; see `docs/evidence/issue-6-median-evaluation.txt`). This is not a real-world accuracy measurement.
* **Full recheck (Zuhair's verification, 1 November 2026, Linux, Node 24.22.1):** `npm ci --ignore-scripts`, `npm run typecheck`, `npm test` (**109/109**, no skips) and `npm run evaluate` all passed. Evidence: `docs/evidence/issue-6-node24-*`. Office browser coverage is added in issue #7. Abdullah's independent review and UML rendering remain separate.

## Issue #7 — executable role and simulator coverage

Zuhair's verification on 1 Nov 2026, Node 24.22.1/Linux: 113/113 unit/integration/architecture tests and 5/5 role browser tests passed. Playwright 1.64.1 used Chromium 138.0.7204.0 from the registry-distributed `@sparticuz/chromium` package because the standard browser download returned an invalid archive in this environment. The optional executable-path setting is documented; normal environments install Playwright's bundled Chromium.

`e2e/roles.spec.ts` drives real forms and a fresh SQLite-backed in-memory server: stop selection/persistence, request creation/cancellation, simulated network loss with failed trip end and recovery, office termination with audit reason, median forecast/explanation, and live updates across separate role sessions. No API response stubs are used in these five tests. `test/unit/simulated-gps.test.ts` uses a controlled clock for projection, route boundaries, dwell, outage and stop cleanup. These are automated checks, not a human rehearsal or device GPS field test.

## Issue #8 — accessibility and mobile corrections

The first automated audit reproduced light-mode text contrast failures and interactive map children hidden under an image role. A controlled-browser-clock test separately reproduced keyboard focus being lost when the waiting card refreshed. The driver confirmation dialog also lacked an accessible name.

Fixes: darker muted text in light mode; map groups expose stop buttons only when they perform an action; noninteractive maps have no dead tab stops; labelled trip-end dialog; skip links and a student page heading; narrow-screen wrapping; reduced-motion support; and a stable waiting card whose countdown updates without rebuilding its controls. After create/cancel, focus moves to the next relevant action.

Verified in Chromium 138, 390×844, light/dark: four axe WCAG-tagged audits, one periodic-refresh keyboard regression and one keyboard-only map/skip-link regression pass. This is **not** WCAG certification or a real NVDA/Narrator session. Actual assistive-technology listening and physical-device checks remain a team task. Automated results are in `docs/evidence/issue-8-accessibility.txt`; before-fix evidence is retained in the review package.

## Issue #5 — use-case validation

See `docs/use-case-validation.md` for a step/extension evidence matrix. Two failing-before browser cases reproduced stale private waiting-request state after expiry and after an offline served event; the student now refreshes its private request on relevant waiting events and reconnect snapshots, and ignores stale reads after a newer mutation. A screen-reader status region announces closures without repeatedly announcing the countdown. The driver no longer attributes every remote closure to the office (the timeout scheduler can also end trips). Seven use-case browser checks passed; production 20s/60s and 30-minute rules were exercised through the existing clock port, not weakened in production.

## Final combined verification (Zuhair's verification, 1 November 2026)

Node 24.22.1, Linux: `npm run typecheck` passed; `npm test` passed **113/113**, zero failed/cancelled/skipped; `npm run test:browser` passed **18/18** (6 accessibility/keyboard, 5 roles, 7 use cases); `npm run evaluate` completed. Chromium was 138.0.7204.0 using the documented executable-path override. The reconnect regression now explicitly closes existing HTTP connections while the browser is offline, verifies the Reconnecting banner, marks the request served, restores connectivity and verifies the refreshed private request. Offline emulation alone did not reliably sever an already-open SSE connection. Test runs are sequential because simultaneous Playwright runs share the output directory. Exact final command output and earlier failing evidence are included in the handoff bundle, outside the source tree.

`npm audit --omit=dev --audit-level=high` found **0 production vulnerabilities**. The full audit reported **2 high development-dependency findings** involving `image-size` through `pptxgenjs`; document-generation tooling remediation and regenerated artifact verification remain for the owner’s document work. No forced dependency upgrade was applied. The workflow defines repeatable CI; its existence alone does not establish that GitHub Actions ran or passed.

Visual QA of the 390px student page found the legend/note covering stop labels. On phone widths these now follow the SVG in document flow; the existing four light/dark role audits also assert non-overlapping map/legend/note bounds. Light and dark mobile screenshots were inspected locally. The first GitHub fork CI run passed all steps at `cc728dd` ([run 41327986414](https://github.com/zuhairhalawa/CampusShuttle/actions/runs/41327986414)); the final head must be checked separately. No upstream PR workflow run was present at that observation.
