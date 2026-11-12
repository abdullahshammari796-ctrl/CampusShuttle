# Speaking script — Campus Shuttle presentation (proposed, not rehearsed)

**Status (10 November 2026).** This is a proposed script for the nine-slide deck (`campus-shuttle-presentation.pptx`, with three backup slides) and a proposed division between Abdullah and Zuhair. Neither member has rehearsed it, and it records no rehearsal. Put it into your own words: the brief says every member speaks, and the instructor may ask either of you about any slide.

**Time limit.** The official limit and running order are published in Week 12 and are **not yet known**. The plan below is fitted to a **provisional budget of 12:00**, with an 8-minute version and a video-only variant. None of them is an official limit, and none has been rehearsed. Speech is estimated at 130 words per minute. The video timings come from the finished file, and the live-demo timings from the tool-driven dry run of 6 November (`docs/evidence/walkthrough-2026-11-06.txt`).

**The video.** `06-Demo.mp4` (4:11) is embedded on slide 7 of the submission copy of the deck. It also ships as a separate file with `06-Demo.srt`. Plan A shows one excerpt and then a short live demonstration. Plan B plays the whole video instead of the live demonstration, but **only if the instructor allows a recording to replace it**; the brief asks for a live demonstration.

## Provisional 12-minute plan (Plan A)

| # | Slide / part | Speaker | Time | Running total |
|---|---|---|---|---|
| 1 | Problem, purpose, team | Abdullah | 0:40 | 0:40 |
| 2 | Stakeholders, use cases, quality | Zuhair | 1:00 | 1:40 |
| 3 | Process and timeline | Abdullah | 1:00 | 2:40 |
| 4 | Four architectures compared | Zuhair | 1:00 | 3:40 |
| 5 | Components and deployment | Abdullah | 0:50 | 4:30 |
| 6 | Patterns tied to behaviour | Zuhair | 0:50 | 5:20 |
| 7a | Demonstration: introduction | Abdullah | 0:20 | 5:40 |
| 7b | Video excerpt **0:51–1:54** (network loss and GPS outage) | — | 1:03 | 6:43 |
| 7c | Live: use case 1 — start a trip, the student sees it Live | Abdullah | 0:50 | 7:33 |
| 7d | Live: use case 2 — waiting request → office → forecast explanation | Zuhair | 1:40 | 9:13 |
| 8 | Verification, limitations, reflection | Abdullah | 1:10 | 10:23 |
| 9 | Conclusion (Zuhair 0:30), questions (Abdullah 0:20) | both | 0:50 | 11:13 |
| | Slide changes and window switching | | 0:47 | **12:00** |

Speaking time: Abdullah 5:10, Zuhair 5:00, video 1:03.

**Plan B — the whole video replaces the live demonstration (only if permitted).**
* Slides 1–6, 5:20.
* Slide 7: introduction 0:20, then the full video, 4:11.
* Slides 8–9, 2:00.

Total **11:51**. Keep the live system running anyway, for questions.

**8-minute version.** Slides 1–6 each shortened to their first two sentences: 0:30, 0:40, 0:40, 0:40, 0:30 and 0:30, which makes 3:30. Then the slide 7 introduction 0:15, video excerpt 1:03, live use case 2 only 1:30, slide 8 0:40, slide 9 0:30. Total **7:28**, with 0:32 for changes.

## Slide by slide

**1 · Problem, purpose, team — Abdullah (0:40)**
"Good morning. I'm Abdullah, and this is Zuhair. Students on a campus cannot see where the shuttle is, so they wait outside or miss it, and the transport office plans its fleet without data. Our system shows live positions and arrival estimates — and, above all, it stays honest when GPS or mobile data fails. Students' 'I'm waiting here' requests become demand history and forecasts for the office. The screenshot is our running prototype with demonstration data."

**2 · Stakeholders, use cases, quality — Zuhair (1:00)**
"Three groups use the system: students, drivers and the transport office. University IT, the data-protection officer and management are affected too, because driver locations and student identities are personal data. We modelled five primary use cases; two of them run end to end in the demonstration. Our quality requirements are measurable scenarios: a new position should reach every viewer within a second; after 20 seconds without one the student sees 'delayed', after 60 seconds 'GPS lost' and no estimate. The hard quality attribute is exactly that: timely and honest information under unreliable GPS and connectivity."

**3 · Process and timeline — Abdullah (1:00)**
"Module 02 separates incremental from iterative development. Incremental adds new parts each time; iterative improves the same parts. We did both. The baseline was built in five slices on a skeleton chosen first, because increment one has to carry every later one. The four riskiest unknowns were tested first, in the spirit of spiral: can one server push to thousands of viewers, how do we stay honest when GPS fails, can we snap positions to a two-way road, and is there data for machine learning. After that, the work was iterative: reviewed pull requests improving what existed. The timeline shows only what the record shows; our own dates for the early course gates are not recorded, and the main lesson is that the work started too late."

**4 · Four architectures — Zuhair (1:00)**
"We compared four architectures against six weighted drivers. The modular monolith with server push scores 61 of 70. The interesting comparison is polling, at 52: it is equal on everything except freshness, and one-second polling would mean one to three thousand requests a second even when nothing moves. So the choice of push rests on that one requirement. Microservices give independent scaling one campus does not need, and the serverless option keeps location data with a third party. The scores are our judgement; only option A's freshness is measured."
*[If either of you changed a score in your own review, say which and why.]*

**5 · Components and deployment — Abdullah (0:50)**
"Inside it is one Node.js process with eight components, each a folder in the source. They talk through interfaces and domain events; tracking and demand never import each other, and a test fails if an import breaks the component diagram. It is deployed as one process with one SQLite file: nothing else to install and nothing to pay for. The trade-off is that one server carries every viewer; several campuses would need a message broker."

**6 · Patterns — Zuhair (0:50)**
"Each pattern solves a problem you will see. State: Live, Location delayed and GPS lost are classes, and each decides what passengers may be told. Adapter: the simulator uses exactly the same upload path as a real phone. Observer: one upload reaches every browser through the event bus. Repository keeps SQL out of the business rules, and Strategy lets us compare four forecasting models. The class diagrams are in the UML appendix."

**7a · Demonstration introduction — Abdullah (0:20)**
"The question is: what happens when connectivity fails? This recording is from our running prototype in three browser windows with simulated GPS. Where waiting time was skipped, the box at the top shows the real elapsed time. The narration is a synthetic voice."

**7b · Video excerpt 0:51–1:54 (1:03).** Play it without talking over the narration.

**7c · Live use case 1 — Abdullah (0:50)** *(runbook steps L1–L2)*
"Now live. As the driver I start a trip on the Campus Loop with simulated GPS… and in the student window the shuttle appears with its arrival time, marked Live."

**7d · Live use case 2 — Zuhair (1:40)** *(runbook steps L3–L5)*
"As a student I tap 'I'm waiting here'. In the office window the waiting count rises at once, on the map and in the counters — the office sees how many people wait, not who. In Demand and forecast I select a cell, and the office sees how the number was calculated: the past weeks, their counts and the range. The history is synthetic, so this shows the method, not accuracy."

**8 · Verification, limitations, reflection — Abdullah (1:10)**
"144 automated tests pass, 119 in Node and 25 in a real browser, including accessibility checks of all three role pages, on every pull request. The test plan records 21 defects and corrections, each checked in the way that fits it. Our local benchmark reached a thousand simulated viewers in about 35 milliseconds at the 95th percentile, but that is one computer, not a campus network. The main limitations: GPS is tested only with the simulator, a hidden driver page stops reporting, and forecasts use synthetic data. What we learned: start earlier, talk to stakeholders before fixing numbers, and check content, not just existence."
*[Each of you: replace the reflection sentence with your own words before presenting.]*

**9 · Conclusion and questions — Zuhair (0:30), Abdullah (0:20)**
*Zuhair:* "To conclude: a modular monolith with server push keeps students informed in real time, and — just as important — tells them when it does not know. Next would be a field test with real phones, then real demand data before any trained model."
*Abdullah:* "Who did what is in the contribution statement, and the AI tools we used are declared in section 10 of the report. Thank you — we are happy to take questions."

## Diagram explanations (for slides 3–6 and questions)
* **Use cases (A.1, A.2).** Three human actors share a *Campus user* parent for sign-in. The GPS receiver and the Scheduler are secondary actors. `«include»` is always part of a use case; `«extend»` is optional (End a trip remotely, Explain a forecast).
* **System sequence diagram (A.4).** One scenario, UC2's main success: the Driver on the left, the system as one box, twelve numbered operations with parameters. The uploads and the trip poll run in parallel, and the load report is optional.
* **State machine (A.6).** `Active` has the sub-states AwaitingFix, Live, Stale and Lost. Time events are `after(20 s)` and `after(60 s)`; any accepted position returns the trip to Live. It maps onto the four classes in `src/tracking/signal-state.ts`.
* **Component diagram (A.11).** Provided interfaces (lollipops) and required interfaces (sockets); the dependency rules are enforced by `test/architecture.test.ts`.
* **Deployment diagram (A.12).** One server node runs the Node.js process and the SQLite file; phones and laptops run browsers.

See also `docs/presentation/viva-sheet.md` and the runbook `docs/demo-script.md`.
