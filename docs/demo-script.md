# Live demonstration script

> The official presentation length and format were **not** in the project description we received (it ends at §4.4). Timings below assume about 12 minutes including the demo; **adjust to the instructor's published running order (Week 12)**. Every team member must speak.

## Before the session (10 minutes earlier)
```bash
npm install            # once
npm run seed           # fresh demo database (wipes local data)
npm start              # terminal 1 → http://localhost:3000
npm run simulate -- --outage --outage-at 30 --outage-for 75   # terminal 2: two background shuttles
```
The simulator prints the exact clock time of every simulated outage of the Campus Loop shuttle (driver2). The demo does **not** depend on catching that window: the GPS-loss step below is triggered by the presenter in the driver window, so it happens exactly when the script says.

Open three browser windows (or one normal + two private windows so the sessions do not overwrite each other): **Student** (`student1`), **Driver** (`driver1`), **Office** (`office1`). Passwords are in the README. Set browser zoom so the projector shows the map and the side panel together. In the student window select the stop **Library & Learning Commons**.

Fallbacks: if the network or projector fails, everything runs on `localhost`; if the simulator is not running, the driver window alone is enough for every step. Have `docs/evidence/` open in case a live step fails (test and load-test outputs).

### Timing of the GPS-loss step (deterministic)
After *Simulate GPS outage* is pressed, the driver's shuttle produces no positions. With the default settings, students see **"Location delayed"** (estimates marked approximate) about 20 s later (17–22 s) and **"GPS lost"** (no estimate, "last seen") about 60 s later (57–62 s). The spread exists because ages are counted from the last position, sent up to 3 s before the press, and the server's signal check runs every 2 s. Pressing the button again sends a position within 3 s, and the shuttle shows **Live** again. If the slot is short, start the server with `STALE_AFTER_SECONDS=10 LOST_AFTER_SECONDS=30 npm start` and **say aloud** that demo thresholds are in use (the defaults are 20 s / 60 s).

## Running order

| Time | Speaker | What to show | What to say (key point) |
|---|---|---|---|
| 0:00 | Member A | Title slide, problem | Students wait outdoors without information; the office plans without data. |
| 1:00 | Member B | Stakeholders, QA scenarios | The hard quality: timely **and honest** information under unreliable GPS. |
| 2:30 | Member A | Architecture alternatives table → decision | Why a modular monolith with SSE beats microservices, polling and BaaS *for this team and campus* (scores + local benchmark). |
| 4:00 | Member B | Component diagram next to the `src/` folder tree | Every box is a folder; `test/architecture.test.ts` fails if code imports a component the diagram does not allow (it checks imports, not every UML detail). |
| 5:00 | Member A | **Demo UC2 + UC1**: driver starts a trip on Campus Loop (simulated GPS); student window shows the shuttle and the ETA updating | One upload → one push to every viewer. Local benchmark: p95 35–37 ms for 1,000 simulated viewers on one machine — not a field measurement. |
| 6:00 | Member A | Driver: *Simulate network loss* → press *End trip* → the app says the trip was **not** ended and keeps sharing; restore the network → queued positions delivered in one batch; *Inject GPS glitch* | Store-and-forward within stated bounds (QA-4); a trip only ends when the server confirms; the server rejects impossible positions. |
| 6:45 | Member B | Driver: press *Simulate GPS outage* and leave it on. Student window: "Location delayed" after ~20 s, then "GPS lost" with no estimate after ~60 s, while you explain | State pattern: no estimate is better than a wrong one. |
| 7:50 | Member B | Driver: press *Simulate GPS outage* again → student window shows **Live** within ~3 s | Recovery on the first accepted position. |
| 8:15 | Member B | **Demo UC3 → UC4/UC5**: student taps *I'm waiting here*; office map badge and KPI update; open *Demand & forecast*, click a cell to show the explanation | Explainable baseline; synthetic data clearly labelled; why no ML model yet (Borealis lifecycle: feasibility). |
| 9:30 | Member A | Office ends the driver's trip with a reason → audit log; driver window returns to start | Role-based access and accountability. |
| 10:00 | Member B | Design patterns slide (Strategy, Observer, State, Repository, Adapter) | Problem each solves, where it is in the code. |
| 10:45 | Both | Testing evidence, limitations, reflection | 103 automated tests, local load test (and its limits), what was not done, what we would do next. |
| 11:30 | — | Questions | Each member must be able to explain any diagram. |

## Likely questions — be ready
* Why not WebSockets? (ADR-0002: one-way traffic; SSE reconnects and sends cookies automatically.)
* What happens if the server restarts during the demo? (Trips are rebuilt from SQLite; browsers reconnect and get a snapshot — try it: Ctrl+C, `npm start`.)
* Does the load test prove 3,000 students can use it? (No. It measures the server's fan-out with simulated viewers in the same process over loopback, sharing one session, with no browsers. A deployment test from separate machines is still needed.)
* What if the session expires while the map is open? (The live stream is closed when the session expires and the page asks the user to sign in again. Logout cannot revoke a copied token early — a known limitation.)
* How do you know the ETA is right? (Arithmetic is unit-tested; real accuracy has **not** been measured — needs a field test.)
* Is the forecast accurate? (Only on synthetic data, which proves nothing about reality — say so.)
* Which parts did the AI write, and what did you change? (Answer from the AI-use statement — honestly.)

### Verification additions (1 November 2026)
Before rehearsing, run `npm run typecheck`, `npm test`, `npm run test:browser` and `npm run evaluate`. The browser tests start their own ephemeral server. In the live demo, keep the default 20 s / 60 s signal thresholds: use **Simulate GPS outage**, observe delayed then lost/no ETA, and restore it. **Simulate network loss** is a different demo: GPS keeps producing positions; attempt End trip, observe **Trip NOT ended**, restore the network and retry. Forecasts have four models, including Same-weekday median (6 weeks). None of this records a human rehearsal or a timed presentation.
