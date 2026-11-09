# Human acceptance checklist (blank — to be completed by the team)

This form collects the facts and observations that only Abdullah and Zuhair can supply. Each item is still **OUTSTANDING** until a member fills it in from their own work. Nothing in it has been filled in on anyone's behalf. Fill it in, commit it under your own name through a reviewed pull request, and then update the linked issue.

**Private fields.** Student IDs and signatures never go into this public file. They belong only in the private submission copy (the team's `TEAM-FACTS-INTAKE.md` and the documents uploaded to Moodle), unless both members decide to publish them.

Tool-driven technical evidence from 6–7 November 2026 (a browser walkthrough, automated accessibility scans, an on-screen inspection of the UML pages and a timed demo dry run; see `docs/evidence/`) can help with §1, §4, §5 and §6, but it does not fill in any field below.

## 1. UML inspection (issue #1) — Abdullah, reviewed by Zuhair
Open `docs/build/uml-diagram-set.pdf`, both on screen at 100 % and as a printed A4 page.

| Figure | Readable on paper? | Notation and arrows correct? | Matches the code? | Checked by / date | Notes |
|---|---|---|---|---|---|
| A.1 Use case | | | | | |
| A.3 Activity | | | | | |
| A.4 System sequence | | | | | |
| A.5 Design sequence | | | | | |
| A.6 State machine (trip) | | | | | |
| A.7 State machine (waiting) | | | | | |
| A.8 Domain model | | | | | |
| A.9 Class diagram 1 | | | | | |
| A.10 Class diagram 2 | | | | | |
| A.11 Component | | | | | |
| A.12 Deployment | | | | | |
| A.13–A.17 Patterns | | | | | |

## 2. Architecture scores (issue #2) and ADR views (issue #9) — each member separately
Score 1–5 in your own judgement. The draft in report §6.3 and `docs/adr/abdullah-technical-review.md` is evidence, not your answer.

| Driver (weight) | A Monolith + SSE | B Microservices | C Monolith + polling | D Serverless | Your reason |
|---|---|---|---|---|---|
| Freshness & fan-out (3) | | | | | |
| Robustness to GPS/network loss (3) | | | | | |
| Security & privacy (2) | | | | | |
| Modifiability & testability (2) | | | | | |
| Operational simplicity (3) | | | | | |
| Growth beyond one campus (1) | | | | | |

| ADR | Agree / disagree, and why (Abdullah) | Agree / disagree, and why (Zuhair) |
|---|---|---|
| 0001–0008 (one row each) | | |

## 3. Field test with a real phone (issue #3) — Abdullah
Run this only on a private network with HTTPS. Never deploy the demo publicly.
* Date, time and place:
* Phone, browser and HTTPS set-up:
* Route walked or driven, and duration:
* Accuracy range, longest gap and rejected positions (from the office trip track):
* What students saw (Live / Delayed / Lost), with screenshots:
* Do the thresholds need changing? Base this on the data only:

## 4. Accessibility sessions (issue #8) — Zuhair, reviewed by Abdullah
* Screen reader and browser (for example NVDA with Chrome, or Narrator with Edge):
* Arrivals, signal states, toasts and the waiting request: what was announced, and any problems:
* Physical device (model, screen size): layout, touch targets and contrast outdoors:
* Fixes needed, or issues opened:

## 5. Use-case walkthrough (issue #5) — Zuhair, reviewed by Abdullah
* UC1 main step 5 (a full loop lap observed in the browser):
* UC4 historical trace view:
* Diagrams A.1, A.3, A.6 and A.7 compared with what you observed:

## 6. Rehearsal (issue #10) — both
| Date | Who presented which part | Duration (official limit: OUTSTANDING) | What went wrong / changed |
|---|---|---|---|
| | | | |
| | | | |

## 7. Team facts (issue #11) — both
* Student IDs: **not here** — private submission copy only.
* Proposal approval date (from the instructor):
* Actual timeline (report §3.3):
* Official rubric and presentation time limit (source):
* Reflection (report §9), in your own words:
* Contribution statement (report §10.1): each member's own list of work here or in the report; signatures and dates in the private submission copy only.
* AI-use statement, "what we changed" (`ai-use-statement.md`):

## 8. Licence (issue #4) — both
* Decision (no licence, or which licence) and the date both agreed:
