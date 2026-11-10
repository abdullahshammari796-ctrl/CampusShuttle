# Requirements traceability: submission conditions and their evidence

Updated 7 November 2026. Sources read on this machine:
* **Brief**: the official *BCS 305 Course Project* description (`Project_description.docx`; all three local copies are identical). The copy ends at §4.4. It refers to a grading rubric in "Section 8" and to presentation timing that it does not contain; it states that 17 of the 30 marks are for planning, modelling and architectural reasoning and that report §6 carries 5 marks.
* **Course slides**: the instructor's decks for Modules 00–04 and 06 and the Week 6 Model Set Studio sheet, as distributed on Moodle. They add later instructions (marked **I** below). Their schedule dates are marked "indicative" by the instructor.
* **Local copies used** (dates are the files' dates on this computer; slide numbers are the numbers printed on the slides): `Project_description.docx` (31 Oct 2026), `BCS305_00_Course_Introduction.pptx` (24 Sep 2026), `BCS305_03_Requirements_Engineering.pptx`, `BCS305_04_System_Analysis_Models.pptx`, `BCS305_06.pptx` and `BCS305_Week6_Model_Set_Studio.docx` (29 Oct 2026). These course files are not published in this repository. Zuhair's review of PR #17 did not have them, so the instructions marked **I** have been checked against them only on Abdullah's computer.

**Class:** R = required by the brief · I = later instructor instruction in the course slides · G = internal project goal · O = optional additional evidence.
**Status:** ✅ done and verified · ◐ done, with a stated limitation · ⏳ OUTSTANDING (needs the team or the instructor) · ✗ not done.

## A. Submission conditions (brief and instructor instructions)

| Ref | Class | Condition | Evidence | Status |
|---|---|---|---|---|
| Brief cover | R | One submission per team on Moodle; project worth 30 % | Private submission folder prepared (outside the repository) | ⏳ upload by the team |
| Brief §4; slides 00 (slides 7, 11) | R, I | Deadlines: proposal Week 4; report and prototype Week 15; presentations Week 14 (4 Dec) or 15 (11 Dec). The instructor's note says every team submits everything before Day 1 (Week 14) | — | ⏳ confirm the binding date on Moodle; plan for the earlier one |
| Brief §1, §8 | R | Grading rubric ("Section 8") | Not in the available copy | ⏳ obtain from Moodle or the instructor |
| Brief §1 | R | A real UAE problem with genuine stakeholders, quality attributes and trade-offs | Report §1–2, §6 | ✅ |
| Brief §2 | R | Team of 3 (± 1 allowed), registered on Moodle by Week 4 | A team of two is within ± 1 | ⏳ registration not recorded |
| Brief §2, §4.1(10) | R | Signed contribution statement listing what each member did; every member contributes to the design | Report §10.1 factual record; `docs/team/contribution-statement.md` | ⏳ personal statements and signatures (private copy) |
| Brief §2; slides 00 (slide 13) | R, I | Any member can explain any diagram or decision in the viva; the mark is adjusted otherwise | Explain-it checklist; `docs/architecture/technical-assessment.md`; speaking script; viva sheet (`docs/presentation/viva-sheet.md`) | ⏳ each member's own preparation |
| Brief §3 | R | Topic approved in Week 4 (one paragraph on Moodle and a two-minute conversation) | `docs/01-proposal.md` | ⏳ approval date not recorded |
| Brief §3 | R | Proposal content: problem, ≥ 3 kinds of user, 3–5 functions, one hard quality attribute, planned prototype | `docs/01-proposal.md` | ✅ |
| Brief §3 | R | Say how personal data is protected | `docs/privacy-and-security.md`, report §6.6 | ✅ |
| Brief §4.0 | R | Proposal: one PDF, 1 page, topic, description, stakeholders, team members | `docs/build/proposal.pdf` (1 page, checked after every build) | ◐ student IDs only in the private copy |
| Brief §4.1 (1) | R | Introduction, problem, scope in and out | Report §1 | ✅ |
| Brief §4.1 (2) | R | Stakeholder analysis; functional requirements; measurable quality-attribute scenarios | Report §2; `docs/architecture/quality-attribute-scenarios.md` | ✅ |
| Module 03 (slide 12) | I | Say which elicitation techniques were used and what each taught | Report §2.4 | ◐ no stakeholder interviews are recorded |
| Brief §4.1 (3) | R | SDLC approach and why; the actual timeline | Report §3.1–3.3 | ◐ repository dates complete; registration, approval and checkpoint dates ⏳ |
| Brief §4.1 (4) | R | Use case diagram and descriptions; activity; system sequence; state machine where relevant | Appendix A.1–A.7 | ✅ (team inspection on paper ⏳, issue #1) |
| Brief §4.1 (5) | R | Domain model; class diagram; component; deployment | Appendix A.8–A.12 | ✅ (team inspection ⏳) |
| Module 06 (slide 35) | I | Report shows the logical view and at least one other (4+1) | Report §5, view table | ✅ |
| Brief §4.1 (6) | R | ≥ 2 candidate styles compared against the quality attributes; justified choice (5 marks) | Report §6 (4 candidates, weighted and justified, with uncertainty); technical assessment; ADR-0001 | ✅ (the scores are a disclosed technical assessment; the members' own scores ⏳, issue #2) |
| Module 03 (slide 17) | I | Name the three requirements that drove the architecture | Report §6.1 | ✅ |
| Brief §4.1 (7) | R | ≥ 3 design patterns, each with its problem and a class diagram | Report §7 (5 patterns); A.13–A.17 | ✅ |
| Brief §4.1 (8) | R | Prototype: what was built, what was not, mapping to the architecture | Report §8 | ✅ |
| Brief §4.1 (9) | R | Honest reflection: what you would do differently | Report §9 (draft from the project record) | ⏳ members' own confirmation |
| Brief §4.1 (10); slides 00 (slide 13) | R, I | AI-use statement: which tool, which part, what you changed | Report §10.2; `docs/team/ai-use-statement.md` | ◐ factual record complete; each member's "what I changed" ⏳ |
| Slides 00 (slide 13) | I | Not allowed: AI-generated UML or analysis submitted as one's own thinking; a report a member cannot explain; AI in place of a teammate's contribution | Disclosure in §10.2; the technical assessment and §9 are labelled; §10.1 separates account records from personal statements | ⏳ the members must be able to explain and defend all of it |
| Slides 00 (slide 13) | I | Turnitin similarity limit of 20 % | Cannot be checked here | ⏳ checked at upload |
| Brief §4.2 | R | UML set as a report appendix and as a separate PDF at full readable size | `docs/build/project-report.pdf` (Appendix A); `docs/build/uml-diagram-set.pdf` (every diagram's smallest text at 7.0 pt or more; large diagrams split only between boxes and labels; test plan items 18 and 21) | ✅ measured from the build; paper check ⏳ |
| Brief §4.2 | R | ≥ 3 written use-case descriptions | Appendix A.2 (five) | ✅ |
| Brief §4.2 | R | Class diagram with attributes, operations, associations and multiplicity | A.9, A.10 | ✅ |
| Brief §4.2 | R | Drawn with a UML tool, standard notation | PlantUML sources, checksum-verified renderer, `npm run uml:check` in CI; on-screen inspection `docs/evidence/uml-inspection-2026-11-06.txt` | ◐ two review questions there; team inspection ⏳ |
| Module 04 (slide 20); Week 6 sheet | I | Run the consistency checks over the model set before submitting | `docs/evidence/uml-inspection-2026-11-06.txt` (five checks) | ◐ run by the tool; the team's own check ⏳ |
| Week 6 sheet, part 3 | I | SSD: one actor on the left, the system as one box, messages as operations with parameters, no Database or Controller lifeline | A.4 | ✅ redrawn on 10 Nov as one scenario (UC2 main success): the Driver as the only actor, the system as one box, operations with parameters (test plan item 20); team inspection ⏳ |
| Module 06 (last slide) | I | Project Checkpoint 1, due Week 9: requirements, the four analysis models and the class diagram in one document | — | ⏳ whether it was submitted is not recorded |
| Brief §4.3 | R | Prototype runs in a live demonstration | `npm start`; demo runbook; timed dry run (`docs/evidence/walkthrough-2026-11-06.txt`); recorded demonstration video (submitted as `06-Demo.mp4`, 4:11) as support and fallback | ✅ live run is the team's to give |
| Brief §4.3 | R | Component boundaries visible in the code | `src/<component>/`; `test/architecture.test.ts` (imports only) | ✅ |
| Brief §4.3 | R | ≥ 2 primary use cases end to end | UC2 + UC1, UC3 → UC4/UC5 (tests, walkthroughs) | ✅ |
| Brief §4.3 | R | Technology justified in one paragraph | Report §8.4 | ✅ |
| Brief §4.3 | R | Source code submitted (repository link or archive) with a README | https://github.com/abdullahshammari796-ctrl/CampusShuttle, `README.md` | ✅ (⏳ the link is uploaded by the team) |
| Brief §4.4 | R | Presentation with live demonstration; every member speaks; strict timing; running order published in Week 12 | `docs/presentation/` (nine slides and three backups with speaker notes, speaking script with a proposed allocation and a provisional 12:00 plan, viva sheet), `docs/demo-script.md` | ⏳ official time limit and slot; whether a recording may replace the live demonstration; rehearsal by both members (issue #10) |

## B. Internal project goals (the team's brief for this build)

| Class | Goal | Where | Status |
|---|---|---|---|
| G | Three roles with working, connected functionality (no mock screens) | `public/*.html`, REST + SSE | ✅ |
| G | Student: live location, ETAs, route/stop info, waiting requests, delayed and lost GPS indicators | Student UI | ✅ |
| G | Driver: start/end trips, location updates, status, GPS interruption and recovery, realistic simulation | Driver UI, `gps.js` | ✅ (◐ device GPS not field-tested) |
| G | Office: routes and trips, active shuttles, waiting demand, trends, predictions | Office UI | ✅ |
| G | Docs match the code; UML compared with the code by hand | `src/`, ports, architecture test, UML comparisons (test plan items 8, 13) | ✅ (◐ manual comparison can drift) |
| G | Demand prediction: baseline first, ML only if justified; synthetic data labelled; no fabricated accuracy | `docs/demand-prediction.md`, ADR-0005 | ✅ |
| G | Tests for workflows, roles, concurrency, ETA, GPS interruption, demand, edge cases, accessibility of all three role pages | `test/` (119 Node tests), `e2e/` (25 Chromium tests); both in CI | ✅ |
| G | Repository changes only through reviewed pull requests; no AI identity in commits | Branch protection; no-reply identity | ✅ |
| G | Accessibility: keyboard and automated WCAG checks on all role pages | `e2e/accessibility.spec.ts`; test plan item 17 | ✅ (screen reader ⏳, issue #8) |

## C. Optional additional evidence (not required by the brief)

| Class | Item | Status and effect on the submission |
|---|---|---|
| O | Field test with a real phone and vehicle (issue #3) | Not done. The brief does not require it. Without it the 20 s / 60 s thresholds and the ETA blend are unvalidated, and the report says so (§6.5, §8.2). |
| O | Screen-reader session and physical-device check (issue #8) | Not done. No screen reader whose output can be observed was available to the tools (test plan §6). Automated scans pass; this is not a screen-reader session. |
| O | Licence (issue #4) | No licence has been chosen, so default copyright applies; this is not an open-source licence. Not a course requirement. |
| O | Load tests (1,000 and 3,000 simulated viewers) | Done as a local benchmark, not a deployment test. |
| O | Arabic (RTL) student page | Not done. |

## D. What still needs people (summary)
Only the team or the instructor can supply these: the rubric and the presentation time limit and slot; the registration, proposal-approval and Checkpoint 1 facts; student IDs and signatures (private copy); each member's personal contribution statement, "what I changed" and reflection; each member's own §6.3 scores and ADR views; the UML paper inspection; the timed two-person rehearsal; and the Moodle upload. The optional items in §C remain optional.
