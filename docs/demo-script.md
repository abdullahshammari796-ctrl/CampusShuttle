# Live demonstration runbook

> The official presentation length and slot are **not yet published** (brief §4.4: running order in Week 12). Until then this runbook fits the **provisional 12-minute plan** in `docs/presentation/speaking-script.md`, which also has 8- and 15-minute cut points and a proposed speaker for every slide. Every member must speak. The measured times below come from a tool-driven dry run on 6 November 2026 (`docs/evidence/walkthrough-2026-11-06.txt`); they are not a two-person rehearsal (issue #10).

## Before the session (15 minutes earlier)
```bash
npm install            # once
npm run seed           # fresh demo database (wipes local demo data)
npm start              # terminal 1 → http://localhost:3000
npm run simulate -- --outage --outage-at 30 --outage-for 75   # terminal 2: two background shuttles
```
The simulator prints the time of every simulated outage of its Campus Loop shuttle (driver2). The demo does not depend on that window: the presenter triggers the GPS-loss step from the driver window.

**Three sessions without interference.** Sessions are per host name, and private windows of one browser share one session. Use three host names that all reach the local server, each in its own window:

| Window | Address | Account |
|---|---|---|
| Student | `http://localhost:3000` | `student1` |
| Driver | `http://127.0.0.1:3000` | `driver1` |
| Office | `http://office.localhost:3000` | `office1` |

Passwords are in the README. In the student window select the stop **Library & Learning Commons**. Set the zoom so the projector shows the map and the side panel together.

**Keep the driver window visible.** In the dry run, the driver page in a background tab stopped sending simulated positions after about five minutes, because browsers throttle hidden pages. The server then correctly showed "Location delayed", but a demo would look broken. Put the windows side by side, or bring the driver window forward at least every few minutes.

### Timing of the GPS-loss step (deterministic)
After *Simulate GPS outage* is pressed, the driver's shuttle produces no positions. With the default settings, students see **"Location delayed"** (estimate approximate) about 20 s later (17–22 s) and **"GPS lost"** (no estimate, "last seen") about 60 s later (57–62 s). The dry run measured 19 s and 59 s. Pressing the button again sends a position within 3 s; the dry run measured 2 s. If the slot is short, start the server with `STALE_AFTER_SECONDS=10 LOST_AFTER_SECONDS=30 npm start` and **say aloud** that demo thresholds are in use (the defaults are 20 s / 60 s).

## Running order (provisional 12-minute plan)
"Measured" is the dry run's execution time for the clicks and waits, including the tool's own latency; "spoken" is the estimate for talking over it.

| Step | Speaker (proposed) | What to do | Expected | Measured / spoken |
|---|---|---|---|---|
| D1 | Abdullah | Driver: route Campus Loop, Shuttle 01, *Simulated GPS* → *Start trip* | Student window lists Shuttle 01 with minutes and distance | 5 s / 20 s |
| D2 | Abdullah | Driver: *Simulate network loss* → wait ~10 s → *End trip* → confirm; then *Simulate network loss* again (restore); then *Inject GPS glitch* | "Trip NOT ended…"; "Delivered N queued positions in one batch"; "Server rejected 1 position(s): implausible jump" | 26 s / 40 s |
| D3 | Abdullah | Driver: *Simulate GPS outage* and leave it on; explain in the student window | "Location delayed" (~20 s), then "GPS lost", no estimate (~60 s) | 59 s / talk over it |
| D4 | Abdullah | Driver: *Simulate GPS outage* again | Student shows Live within a few seconds | 2 s / 10 s |
| D5 | Zuhair | Student: *I'm waiting here*. Office: map badge and "Students waiting"; *Demand & forecast* → select a cell (mouse, or Tab to it and press Enter) | Office counts 1 waiting; explanation lists past dates, counts and range, with the synthetic-data banner | 90 s (about 45 s of it was the tool locating the cell) / 60 s |
| D6 (15-min slot) | Zuhair | Office: *Live operations* → *End* on Shuttle 01 → reason → *End trip*; then *System* → audit log | Driver window: "This trip is no longer active…", start form; audit entry with the reason | 13 s / 30 s |

The 12:00 plan budgets 3:30 for D1–D5: 2:15 for Abdullah (D1–D4) and 1:15 for Zuhair (D5). The spoken estimates in the last column add up to about 3:10. In the dry run, D1–D5 took about 3:00, of which about 45 s was the tool's own latency.

## Failure fallback
| If… | Then |
|---|---|
| The browser or projector fails | Everything runs on `localhost`; switch to the slides (slides 9–11 show the real screens) and narrate the dry-run timings above. |
| A window shows "Reconnecting" or the shuttle freezes | Bring the driver window to the front (background throttling). If the server stopped: Ctrl+C, `npm start`; trips are rebuilt from SQLite and browsers reconnect with a snapshot. |
| Sign-in fails or sessions overwrite each other | Check that each window uses its own host name (table above). |
| The simulator is not running | Not needed: the driver window alone covers D1–D6. |
| The 60 s GPS wait does not fit the slot | Restart with the demo thresholds (10 s / 30 s) and say so aloud. |
| The forecast shows "no history" | Pick a date close to the seed date: `npm run seed` creates about eight weeks of synthetic history ending the day before. |
| Nothing works | Show `docs/evidence/` (test runs, load tests, evaluation, walkthrough log) and the screenshots in `docs/presentation/screenshots/`. |

## Likely questions — be ready
* Why not WebSockets? (ADR-0002: traffic is one-way; SSE reconnects and sends cookies automatically.)
* Why not polling? (Report §6.3: it would be as good on every driver except freshness. Meeting the one-second target needs about 1 s polling, which means 1,000–3,000 requests/s.)
* What happens if the server restarts during the demo? (Trips are rebuilt from SQLite; browsers reconnect and get a snapshot.)
* Does the load test prove 3,000 students can use it? (No. It measures the server's fan-out with simulated viewers in the same process over loopback, sharing one session, with no browsers.)
* What if the session expires while the map is open? (The live stream is closed and the page asks the user to sign in again. Logout cannot revoke a copied token early — a known limitation.)
* How do you know the ETA is right? (The arithmetic is unit-tested; real accuracy has **not** been measured and needs a field test.)
* Is the forecast accurate? (Only on synthetic data, which proves nothing about reality.)
* Which parts did the AI write, and what did you change? (Answer from the AI-use statement, honestly and in your own words.)

## Checks before rehearsing
Run `npm run typecheck`, `npm test`, `npm run test:browser` and `npm run evaluate`; the browser tests start their own server. None of this records a human rehearsal or a timed presentation.
