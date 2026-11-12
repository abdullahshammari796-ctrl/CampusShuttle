# Live demonstration runbook

> The official presentation length and slot are **not yet published** (brief §4.4: running order in Week 12). This runbook fits **Plan A** of the provisional 12-minute plan in `docs/presentation/speaking-script.md`: one video excerpt, then two use cases live. The recorded video `06-Demo.mp4` (4:11) is the fallback; it replaces the live demonstration only if the instructor allows it. The measured times below come from a tool-driven dry run on 6 November 2026 (`docs/evidence/walkthrough-2026-11-06.txt`) and from the recording session of 10 November. They are not a two-person rehearsal (issue #10).

## Before the session (15 minutes earlier)
```bash
npm install            # once
npm run seed           # fresh demo database (wipes local demo data)
npm start              # terminal 1 → http://localhost:3000
```
Optional, for more traffic on the map: `npm run simulate -- --outage --outage-at 30 --outage-for 75` in terminal 2 (two background shuttles). The demonstration does not depend on it.

**Three sessions without interference.** Sessions are per host name, and private windows of one browser share one session. Use three host names that all reach the local server, each in its own window:

| Window | Address | Account |
|---|---|---|
| Student | `http://localhost:3000` | `student1` |
| Driver | `http://127.0.0.1:3000` | `driver1` |
| Office | `http://office.localhost:3000` | `office1` |

* Passwords are in the README.
* In the student window select the stop **Sports Complex**: it is far enough along the Campus Loop that the waiting request stays open during the demonstration.
* Set the zoom so the projector shows the map and the side panel together.
* Open the submission copy of the deck (video embedded on slide 7) and check that the video plays. Keep `06-Demo.mp4` in the same folder as a second way to play it.

**Keep the driver window visible.** In the dry run, the driver page in a background tab stopped sending simulated positions after about five minutes, because browsers throttle hidden pages. The server then correctly showed "Location delayed", but a demo would look broken. Put the windows side by side, or bring the driver window forward at least every few minutes.

## Running order (Plan A, 12:00 budget)

| Step | Speaker | What to do | Expected | Time |
|---|---|---|---|---|
| V | — | Slide 7: play the video from **0:51 to 1:54** (network loss, GPS outage) | Queue grows; "Trip NOT ended"; 10 positions in one batch; Live → Location delayed → GPS lost → Live | 1:03 |
| L1 | Abdullah | Driver: route Campus Loop, Shuttle 01, *Simulated GPS* → *Start trip* | Driver: "Live" badge within about 1 s | 0:20 |
| L2 | Abdullah | Student window: point at *Next arrivals* | Shuttle 01 with minutes, distance and a green "Live" | 0:30 |
| L3 | Zuhair | Student: *I'm waiting here* | "You're on the waiting list at Sports Complex" | 0:20 |
| L4 | Zuhair | Office: *Live operations* → point at "Students waiting" and the map badge | Count 1 at 1 stop, without a name | 0:25 |
| L5 | Zuhair | Office: *Demand & forecast* → select a cell (mouse, or Tab and Enter) | Explanation: the past dates with counts, the expected value and range; the synthetic-data banner | 0:55 |

L1–L5 budget 2:30: Abdullah 0:50, Zuhair 1:40. In the recording session the script saw "Live" on both pages within 0.26 s of *Start trip*. It saw the office count rise 25 ms after the student's confirmation. The script checks about every 0.2 s, so these are upper bounds, not precise latencies.

**If there is more time (15-minute slot).**
* L6 (Abdullah): *Simulate network loss* → *End trip* → confirm. Expect "Trip NOT ended". Then *Simulate network loss* again: "Delivered N queued positions in one batch". About 0:40.
* L7 (Zuhair): Office → *Live operations* → *End* on Shuttle 01 → reason → *End trip* → *System* → audit log. The driver window returns to the start form, and the audit entry shows the reason. About 0:30.

### GPS-outage timing, if shown live
After *Simulate GPS outage* is pressed, the shuttle produces no positions.
* With the default settings, students see **"Location delayed"** about 20 s later and **"GPS lost"** (no estimate) about 60 s later.
* Measured: 19 s and 59 s in the dry run; 20.2 s and 58.2 s in the recording session.
* Pressing the button again brings Live back within about 2 s.
* If the slot is short, start the server with `STALE_AFTER_SECONDS=10 LOST_AFTER_SECONDS=30 npm start` and **say aloud** that demo thresholds are in use (the defaults are 20 s and 60 s).

## Video fallback (chapter start times in `06-Demo.mp4`)
| Chapter | Starts at |
|---|---|
| Introduction / the question | 0:00 / 0:17 |
| 1 · A normal trip (start, Live, waiting request) | 0:32 |
| 2 · Network loss | 0:51 |
| 3 · GPS outage | 1:20 |
| 4 · Demand and forecast (served, forecast explanation) | 1:55 |
| 5 · Architecture | 2:26 |
| 6 · Evidence and limits | 3:41 |

The MP4 has chapter markers, so most players can jump between them. `06-Demo.srt` holds the same subtitles as the burned-in ones.

## Failure fallback
| If… | Then |
|---|---|
| The live system fails | Play the video chapters that cover the step (table above); say that it is a recording of the same prototype. |
| The embedded video does not play | Open `06-Demo.mp4` from the submission folder in any player. |
| A window shows "Reconnecting" or the shuttle freezes | Bring the driver window to the front (background throttling). If the server stopped: Ctrl+C, then `npm start`; trips are rebuilt from SQLite and browsers reconnect with a snapshot. |
| Sign-in fails or sessions overwrite each other | Check that each window uses its own host name (table above). |
| The forecast shows "no history" | Run `npm run seed`: it creates about eight weeks of synthetic history ending the day before. |
| Nothing works | Show `docs/evidence/` (test runs, load tests, evaluation, walkthrough log) and the screenshots in `docs/presentation/screenshots/`. |

## Checks before rehearsing
Run `npm run typecheck`, `npm test`, `npm run test:browser` and `npm run evaluate`; the browser tests start their own server. None of these checks records a human rehearsal or a timed presentation. Likely questions and short answers are in `docs/presentation/viva-sheet.md`.
