# Requirements traceability checklist

Source of truth: the official *BCS 305 Course Project* description (the copy provided ends at §4.4; the sections it refers to on milestones, presentation timing and the grading rubric — "Section 8" — were **not included**, so no rubric detail is assumed here). Also covered: the team's own brief for this build.

Status: ✅ done and verified · ◐ done, with a limitation · ⏳ OUTSTANDING (needs the team or the instructor) · ✗ not done

## A. Official project description

| Ref | Requirement | Where it is met | Status |
|---|---|---|---|
| §1 | Design project for a real UAE problem with genuine stakeholders, quality attributes and trade-offs | Report §1–2, §6 | ✅ |
| §1 | Architectural reasoning outweighs polish (17/30 marks for planning, modelling, architecture) | Report §3–7, ADRs, UML set | ✅ |
| §2 | Team of 3 (± 1 allowed); registered on Moodle by Week 4 | Team of 2 is within ± 1 | ⏳ team to confirm registration |
| §2 | Signed contribution statement; all members contribute to the design | `docs/team/contribution-statement.md` (template), ownership plan | ⏳ team must complete and sign |
| §2 | Any member can explain any diagram/decision | "Explain-it" checklist in ownership plan | ⏳ team preparation |
| §3 | Proposal: problem, ≥ 3 kinds of user, 3–5 functions, one hard quality attribute, planned prototype; approved Week 4 | `docs/01-proposal.md` | ◐ written; ⏳ approval date unknown |
| §3 | Personal data: say how it is protected | `docs/privacy-and-security.md`, report §6.6 | ✅ |
| §4.0 | Proposal as a 1-page PDF with topic, description, stakeholders, team members | `docs/build/proposal.pdf` (built from `docs/01-proposal.md`) | ◐ student IDs missing |
| §4.1 (1) | Introduction & problem, scope in/out | Report §1 | ✅ |
| §4.1 (2) | Stakeholder analysis; functional requirements; NFRs as measurable QA scenarios | Report §2; `docs/architecture/quality-attribute-scenarios.md` | ✅ |
| §4.1 (3) | SDLC approach and why; actual timeline | Report §3 | ◐ ⏳ actual dates before 31 Oct to be filled by the team |
| §4.1 (4) | Use case diagram + descriptions; activity; system sequence; state machine | Appendix A.1–A.7 | ◐ sources written and corrected against the code (1 Nov); ⏳ not yet rendered (PlantUML execution blocked here) |
| §4.1 (5) | Domain model; class diagram; component; deployment | Appendix A.8–A.12 | ◐ sources written and corrected against the code (1 Nov); ⏳ not yet rendered |
| §4.1 (6) | ≥ 2 candidate styles compared against QAs; justified choice | Report §6 (4 candidates, weighted table); ADR-0001 | ✅ |
| §4.1 (7) | ≥ 3 design patterns: problem solved + class diagram | Report §7 (5 patterns); Appendix A.13–A.17 | ◐ ⏳ diagrams not yet rendered |
| §4.1 (8) | Prototype: built / not built / mapping to architecture | Report §8 | ✅ |
| §4.1 (9) | Honest reflection | Report §9 (factual observations) | ⏳ team must write it |
| §4.1 (10) | Contribution statement (signed) and AI-use statement | Report §10; `docs/team/` | ⏳ team must complete and sign |
| §4.2 | UML set as report appendix and separate full-size PDF | `docs/03-uml-diagram-set.md` → `docs/build/uml-diagram-set.pdf` and appended to the report | ◐ ⏳ rendering pending |
| §4.2 | ≥ 3 use-case descriptions | Appendix A.2 (five) | ✅ |
| §4.2 | Class diagram with attributes, operations, associations, multiplicity | Appendix A.9, A.10 | ◐ ⏳ rendering pending |
| §4.2 | Drawn with a UML tool, standard notation | PlantUML sources `docs/uml/*.puml` | ◐ ⏳ render and visually check |
| §4.3 | Prototype must run (live demo) | `npm start`; demo script | ✅ |
| §4.3 | Component boundaries visible in code | `src/<component>/`; allowed imports enforced by `test/architecture.test.ts` (imports only — UML operations and associations are checked by hand) | ✅ |
| §4.3 | ≥ 2 primary use cases end to end | UC2+UC1 and UC3→UC4/UC5 (tests + browser walkthrough) | ✅ |
| §4.3 | Technology justified in one paragraph | Report §8.4 | ✅ |
| §4.3 | Source code submitted with a README explaining how to run it | `README.md`; public repository https://github.com/abdullahshammari796-ctrl/CampusShuttle | ✅ (repository created 1 Nov 2026; ⏳ Zuhair's collaborator invitation pending; ⏳ Moodle submission by the team) |
| §4.4 | Presentation; every member speaks; strict timing | `docs/presentation/`, `docs/demo-script.md` | ◐ ⏳ official time limit unknown |
| §8 | Grading rubric | Not in the provided document | ⏳ obtain from the instructor |

## B. Team brief for this build

| Requirement | Where | Status |
|---|---|---|
| Three roles with working, connected functionality (no mock screens) | `public/*.html`, REST + SSE | ✅ |
| Student: live location, ETAs, route/stop info, waiting requests, stale/unavailable GPS indicators | Student UI | ✅ |
| Driver: start/end trips, location updates, status, GPS interruption handling and recovery, realistic GPS simulation | Driver UI, `gps.js` | ✅ (◐ device GPS not field-tested) |
| Office: routes and trips, active shuttles, waiting demand, trends, predictions | Office UI | ✅ |
| ≥ 2 architecture alternatives vs measurable QAs; simplest adequate architecture | Report §6 | ✅ |
| Separated responsibilities, defined interfaces, data models, patterns; docs match code | `src/`, ports, architecture test (imports only), UML compared with the code by hand on 1 Nov | ✅ (◐ manual comparison can drift) |
| Real-time & concurrency; ETA; outages; persistence & consistency; security & RBAC; privacy; performance & scalability; maintainability & testability | Report §6.6 | ✅ |
| ≥ 3 patterns with UML class diagrams | 5 patterns | ◐ rendering pending |
| Demand prediction: baseline first, ML only if justified; synthetic data labelled; no fabricated accuracy; ML lifecycle link | `docs/demand-prediction.md`, ADR-0005 | ✅ |
| UML with a proper tool, editable sources, exported diagrams where supported | PlantUML sources | ◐ exports blocked in this environment (see README "Rendering the UML diagrams") |
| Proposal, report, UML set, README, ADRs, QA scenarios, test plan, presentation/demo materials | `docs/` | ✅ drafts (⏳ PDFs need rendered diagrams) |
| Free, local stack; reproducible setup; demo data; automated tests | `package.json`, seed, tests | ✅ |
| Tests: main workflows, roles, simultaneous connections, ETA, GPS interruption/recovery, demand calculations, edge cases | `test/` (103 tests, incl. driver trip ending, live-stream session expiry, review packaging) | ✅ |
| No remote repository, pushes, commits or Git config changes without explicit authorisation | Repository created, baseline pushed and Zuhair invited only on Abdullah's explicit request (1 Nov 2026), after a public-release audit; commits use Abdullah's GitHub no-reply address, no Git configuration was changed, no AI co-author | ✅ |
| Work-ownership plan with genuine future contributions | `docs/team/work-ownership-plan.md` | ✅ |
