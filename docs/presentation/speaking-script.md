# Speaking script — Campus Shuttle presentation (proposed, not rehearsed)

**Status (7 November 2026).** This is a proposed script and a proposed division between Abdullah and Zuhair. Neither member has rehearsed it, and it records no rehearsal. Change the wording into your own words: the brief says every member speaks, and the instructor may ask either of you about any slide.

**Time limit.** The official limit and the running order are published in Week 12 and are **not yet known**. Until then the script is fitted to a **provisional budget of 12:00**, with 8- and 15-minute versions below. None of these is an official limit, and none has been rehearsed.

**How the budget is estimated.** Speech is estimated at 130 words per minute. The quoted text below has about 1,090 words, so speaking takes about **8:25**. The demo adds clicks and waits that nobody talks over, about **1:45**:
* about 35 s of clicks in D1, D2 and D4;
* about 35 s of the 60 s GPS-loss wait in D3, the rest of which is talked over;
* about 35 s of clicks and window switching in D5.

Speech and the uncovered demo time come to about **10:10**. The remaining 1:50 of the budget is for slide changes, pauses and window switching. The demo times come from the tool-driven dry run of 6 November (`docs/evidence/walkthrough-2026-11-06.txt`), not from a rehearsal.

**Before you present.**
* Decide whether you agree with the §6.3 scores and the ADRs (issues #2 and #9). If you changed a score, say so on slide 4.
* Practise the demo with the runbook in `docs/demo-script.md`, using separate windows.

| # | Slide | Proposed speaker | 12:00 budget | 8-minute version |
|---|---|---|---|---|
| 1 | Title | Abdullah | 0:30 | 0:20 |
| 2 | Students wait blind; the office plans without data | Zuhair | 0:45 | 0:30 |
| 3 | The hard quality: timely and honest information | Zuhair | 0:45 | 0:30 |
| 4 | Four architectures compared | Abdullah | 1:15 | 0:50 |
| 5 | One process, eight components | Abdullah | 0:45 | 0:50 (adds one sentence from slide 6) |
| 6 | One GPS upload reaches every viewer | Abdullah | 0:40 | — |
| 7 | When GPS fails, the system says so | Zuhair | 0:40 | 0:30 |
| 8 | Five design patterns | Zuhair | 0:40 | 0:15 (names only) |
| 9 | Three roles, one live system | Zuhair | 0:15 | — |
| 10 | Demand forecasts the office can explain | Zuhair | 0:30 | 0:35 (adds one sentence from slide 11) |
| 11 | Synthetic backtest | Zuhair | 0:30 | — |
| 12 | Live demonstration: demo 1 | Abdullah | 2:15 | 1:15 (D1, D3 with demo thresholds) |
| 12 | Live demonstration: demo 2 | Zuhair | 1:15 | 1:00 (D5) |
| 13 | Tested, measured — and honest about the gaps | Abdullah | 0:45 | 0:30 |
| 14 | What we would do next · questions | Abdullah 0:15, Zuhair 0:15 | 0:30 | 0:20 |
| | **Total** | | **12:00** (Abdullah 6:25, Zuhair 5:35) | **7:25** + about 0:35 for changes = **8:00** (Abdullah 3:55, Zuhair 3:30) |

## Slide by slide

**1 · Title — Abdullah (0:30)**
"Good morning. I'm Abdullah, and this is Zuhair. Our project is Campus Shuttle Tracking and Demand Prediction: a system that tells students where the campus shuttle is and when it will reach their stop, and tells them honestly when it does not know. It also gives the transport office the demand data to plan with. What you see is the real student page of our prototype."

**2 · Problem — Zuhair (0:45)**
"Three groups have this problem. Students cannot see the shuttle, so they wait outside, often in the heat, or miss it. Drivers get calls asking where they are, and are blamed when GPS or mobile data fails. The transport office sees neither its fleet nor where and when students actually wait. University IT and the data-protection officer are affected too, because driver locations and student identities are personal data. Everything in the prototype is demonstration data, not a real university."

**3 · The hard quality — Zuhair (0:45)**
"The quality attribute we named in the proposal is information that is timely *and* honest. When GPS works, every viewer should see a new position within about a second. When it fails, the system must say 'location delayed' and then 'GPS lost', instead of showing a confident but wrong arrival time. In a local benchmark, one update reached a thousand simulated viewers in 35 milliseconds at the 95th percentile. That is one PC, not a campus network, and we say so in the report."

**4 · Four architectures — Abdullah (1:15)**
"We compared four architectures against six weighted drivers: a modular monolith with server push, microservices, a simple monolith with polling, and a hosted serverless backend. The modular monolith scores 61 of 70. The interesting comparison is with polling, at 52. On every driver except freshness the two are equal. Polling every second, to meet our one-second target, would mean one to three thousand requests a second even when nothing moves. So our choice of push rests on that one requirement; if the office accepted data a few seconds old, polling would be a good choice. Microservices would give independent scaling that one campus does not need, at a cost two students cannot carry. The serverless option keeps location data with a third party. The scores and their reasons are in section 6.3. Only the freshness of option A is measured; the rest is judgement."
*[If you changed any score in your own review, say which and why here.]*

**5 · Components — Abdullah (0:45)**
"Inside, it is one Node.js process with eight components. Each box here is a folder in `src/`. Components talk through interfaces and domain events. Tracking and demand never import each other, and only one file, the composition root, knows the concrete classes. A test fails if any import breaks the rules of our component diagram. It checks imports only; we compared the class diagrams with the code by hand."

**6 · One upload — Abdullah (0:40)**
"Here is one GPS upload. The driver's page queues positions and sends them in a batch. The server checks the session and that the driver owns the trip, snaps the positions onto the route, computes ETAs and stores them *before* changing anything in memory. Then it publishes one event, and the real-time gateway writes one message per trip to every viewer. A slow phone skips updates and gets a fresh snapshot; it cannot grow server memory."

**7 · GPS states — Zuhair (0:40)**
"This is the trip's state machine from appendix A.6, and it is also the State pattern in the code: one class per state. After 20 seconds without a position, students see 'delayed' and an approximate time; after 60 seconds, 'GPS lost' and no estimate at all. The first new position brings it back to Live. If the driver's phone loses mobile data, positions wait in the page and arrive in one batch when the network returns."

**8 · Patterns — Zuhair (0:40)**
"We apply five patterns, each with a class diagram in the appendix. Strategy lets us swap ETA and forecasting algorithms; adding a fourth forecasting model took one class and one line. Observer lets one update reach hundreds of browsers without tracking knowing any of them. State you just saw. Repository keeps SQL out of the business rules, so tests run without a database. Adapter lets the GPS simulator and a real phone use exactly the same upload path."

**9 · Three roles — Zuhair (0:15)**
"Three roles, one live system: student, driver and transport office. None of these screens is a mock-up."

**10 · Forecasts — Zuhair (0:30)**
"For the office, every forecast can be explained: it shows the exact past values and weights it came from, and says 'no forecast' rather than guessing zero. We followed the ML lifecycle in the recommended reading. At the feasibility stage, with no real data, we decided not to train a model."

**11 · Synthetic backtest — Zuhair (0:30)**
"This backtest runs on synthetic data that we generated from our own assumptions. The weekday-aware models beat the naive one only because the data was built that way. So this checks the pipeline, not real accuracy. With one semester of real requests, the same backtest will decide whether a trained model is worth adding."

**12 · Live demonstration — 3:30 (see the runbook for every click)**

*Demo 1 — Abdullah, driver and student windows (2:15: about 45 s of speech, about 35 s of clicks, and the 60 s GPS-loss wait, partly talked over):*
"I start a trip on the Campus Loop with simulated GPS… and the shuttle appears in the student window with its arrival time. Now I cut the phone's network and try to end the trip: the app says the trip was *not* ended, because the server could not confirm it. I restore the network and the queued positions arrive in one batch. An impossible jump is rejected. Now a GPS outage: no positions at all." *[Talk over the wait; it takes about 20 s, then 60 s.]* "There is 'location delayed'… and there is 'GPS lost', with no estimate. I restore GPS, and it is Live again within a few seconds."

*Demo 2 — Zuhair, student and office windows (1:15: about 25 s of speech and about 35 s of clicks and window switching):*
"As a student, I tap 'I'm waiting here'. The office sees one student waiting at the Library, on the map and in the counters, but not who I am. In Demand and forecast I select a cell, and the office sees exactly how that number was calculated." *[In a 15-minute slot, also run D6 from the runbook: the office ends the trip with a reason, and the driver's window returns to the start form.]*

**13 · Evidence — Abdullah (0:45)**
"144 automated tests pass: 119 in Node and 25 in a real browser, including accessibility checks of all three role pages, on every pull request. The test plan records 19 defects and corrections, each checked the way that fits it: tests, audits, source comparison or visual checks. For example, a regression test covers the trip the driver's page abandoned before the server confirmed its end. Not done yet: a real-phone field test, a screen-reader session, real demand data, and our own paper check of the diagrams, whose smallest labels are below 6 points on A4."

**14 · Next steps and questions — Abdullah and Zuhair (0:30)**
*Abdullah:* "First, a field test on a real shuttle, to tune the 20- and 60-second thresholds."
*Zuhair:* "Then one semester of real requests, and a trained model only if it beats the baseline."
*Both:* "How the work was produced, including the AI tools we used, is declared in section 10 of the report. Thank you; we are happy to take questions."

## Cut points
* **8 minutes:** use the last column of the table.
  * Drop slides 6, 9 and 11, with one sentence each from slides 6 and 11 moved to slides 5 and 10.
  * On slide 8, name the patterns only.
  * Demo: D1, then D3 with the demo thresholds. Start the server with `STALE_AFTER_SECONDS=10 LOST_AFTER_SECONDS=30` and *say* that you did; the wait then drops from 60 s to 30 s. Then D5.

  That gives about 7:25 of slides and demo, plus about 0:35 for slide changes.
* **15 minutes:** the 12:00 plan, plus:
  * D6 (office ends the trip; Zuhair, +0:30);
  * 0:45 more on slide 4, on what would change the decision (Abdullah);
  * 0:45 more on slide 13, on how the defects were found (Abdullah);
  * about 1:00 kept for questions.

  That gives Abdullah 7:55, Zuhair 6:05 and questions 1:00, which is 15:00.

## Likely questions (answer in your own words)
See "Likely questions" in `docs/demo-script.md`, the explain-it checklist in `docs/team/work-ownership-plan.md`, and `docs/architecture/technical-assessment.md` §1.3 ("what would change the decision").
