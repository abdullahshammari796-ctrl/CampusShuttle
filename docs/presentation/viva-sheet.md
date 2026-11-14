# Viva preparation sheet — Campus Shuttle (proposed, not rehearsed)

The instructor may ask any of the four members about any part of the work. Each answer below is a short, evidence-based starting point with the place to check it. **Answer in your own words, and only claim what you did yourself.** How the work was produced, including the AI tools used, is in report §10.2 and `docs/team/ai-use-statement.md`.

## Architecture and decisions
| Question | Short answer | Evidence | Lead |
|---|---|---|---|
| Why a modular monolith and not microservices? | One campus does not need independent scaling. Microservices would mean at least 5 deployables, a broker and distributed failure modes for a team of two. Boundaries are still enforced in code. | report §6.2–6.4; ADR-0001; `test/architecture.test.ts` | Abdullah |
| Why Server-Sent Events, not polling or WebSockets? | Traffic is one-way, server to browser. SSE reconnects and sends cookies automatically. Polling every second to meet the 1 s freshness target means 1,000–3,000 requests/s even when nothing moves. | ADR-0002; report §6.3 | Zuhair |
| What would change the decision? | Several campuses or server instances (put a broker behind `EventPublisher`), or a relaxed freshness requirement (then polling is fine). | `docs/architecture/technical-assessment.md` §1.3 | Abdullah |
| What is the main trade-off? | Simplicity versus a single point of load: one process carries every viewer. Restart recovery comes from SQLite, but there is no second instance. | report §6.5 | Abdullah |
| Where are ETAs computed, and why on the server? | In `TrackingService` with an `EtaStrategy`. Every viewer sees the same estimate, and the server knows the signal state that decides how much may be shown. | ADR-0004; report §6.1, §7.1 | Zuhair |

## UML and modelling
| Question | Short answer | Evidence | Lead |
|---|---|---|---|
| Walk me through the system sequence diagram. | One scenario: UC2's main success. The Driver is the only actor, the system one box, twelve numbered operations with parameters. Uploads and the trip poll run in parallel; the load report is optional. | Appendix A.4; test plan item 20 | Abdullah |
| How does the state machine relate to the code? | `Active` has AwaitingFix, Live, Stale and Lost, driven by `after(20 s)`, `after(60 s)` and accepted positions. These are exactly the four classes of the State pattern in `src/tracking/signal-state.ts`. | A.6; A.15; report §4, §7.3 | Zuhair |
| Show an association with a multiplicity and explain it. | Example: `WaitingRequestRepository "1" o-- "0..*" WaitingRequest`. One repository stores any number of requests; aggregation, because requests exist as records independent of the repository object. | A.10 | Zuhair |
| Difference between the domain model and the design class diagrams? | The domain model (A.8) shows concepts and their relations without software classes. The design class diagrams (A.9, A.10) show the actual TypeScript classes, interfaces, operations and dependencies. | Appendix A | Abdullah |
| Were the diagrams checked against the code? | Yes, member by member, on 1 Nov and again after PRs #12 and #13. Only the allowed imports are checked automatically; operations, attributes and multiplicities were compared by hand. | test plan items 8, 13; UML set intro | Abdullah |

## Quality, testing and evidence
| Question | Short answer | Evidence | Lead |
|---|---|---|---|
| Does the load test prove 3,000 students can use it? | No. It measures the server's fan-out with simulated viewers in the same process over loopback, sharing one session, with no browsers. A deployment test from separate machines is still needed. | report QA-1/QA-2; `docs/evidence/load-test-*.txt` | Abdullah |
| What happens if the network drops on the driver's phone? | Positions are queued in the page (newest 500), retried with backoff, then delivered in order on reconnection. Duplicates, positions over 10 min old and impossible jumps are rejected. Ending the trip fails honestly while offline. Closing the page loses the queue. | QA-4; test plan item 5; video 0:51 | Abdullah |
| How do you know the ETA is right? | The arithmetic is unit-tested (nominal speed and dwell, blended speed, no backward jitter, lane-correct snapping). Real-world accuracy has **not** been measured; it needs a field test. | test plan §4 "ETA behaviour" | Zuhair |
| Is the forecast accurate? | Only on synthetic data, which proves the pipeline and nothing about reality. With one semester of real requests, the same backtest decides whether a trained model is worth adding. | report §6.7; `npm run evaluate` | Zuhair |
| Which defects did testing find? | 21 items: for example, corner snapping (load test), work after shutdown (integration test), a trip ended locally but not on the server (review), credentials that could reach a URL (browser run), office accessibility failures (walkthrough). | `docs/test-plan.md` §4 | either |
| What is not tested? | A real phone on a real vehicle, a screen-reader session, a deployment load test, the team's own paper check of the UML. | report §8.2; test plan §6 | either |

## Process, privacy and the video
| Question | Short answer | Evidence | Lead |
|---|---|---|---|
| Which SDLC did you follow? | An incremental structure (five slices on a skeleton chosen first), the riskiest unknowns tested first in the spirit of spiral, then iterative rounds through reviewed pull requests. No Scrum sprints. Our dates for the early course gates are not recorded. | report §3.1–3.3 | Abdullah |
| How is privacy handled? | Students' locations are never collected; a waiting request names only the stop. The requester is stored as a pseudonym, erased 24 h after closing. Raw GPS is deleted after 30 days, and privileged office actions are audited. | report §6.6; QA-6 | Zuhair |
| Was the video edited? | It is a recording of the running prototype with a throw-away database and simulated GPS. Waiting time was skipped only where the TIME-LAPSE box shows the real elapsed time. Thresholds were not changed, no stretch is shown twice, and the narration is a synthetic voice. | `06-Demo-Transcript.pdf`; the media folder's README | Abdullah |
| What did each of you do, and what did the AI tools do? | Answer from the factual record (report §10.1) and your own experience: which parts you read, checked, decided or changed yourself. **Do not claim more than you did.** | report §10; `docs/team/contribution-statement.md` | each member |

## First run and forecast check
| Question | Short answer | Evidence | Lead |
|---|---|---|---|
| How do you start the prototype from a fresh copy, and how do you know it worked? | Install Node.js 24, run `npm install` and `npm start`, open `http://localhost:3000` and sign in as `student1`. *[What you saw after sign-in, from your check.]* | README "Quick start" and "Verify your first run" | Mubarak |
| Show how one forecast number is calculated. | The default model is the seasonal average: the mean of the same stop, weekday and hour over the previous four weeks. *[Your stop and hour, the four counts, their average and the value on screen.]* | `docs/demand-prediction.md` §3 and the worked example | Ali |

## Before the viva
* Each member: complete your personal contribution and AI-use statements, and decide whether you agree with the §6.3 scores and the ADRs (issues #2 and #9).
* Look at every diagram once on paper, and be able to explain A.1, A.4, A.6, A.8 and A.11 without notes.
