# Suggested work-ownership plan (Abdullah & Zuhair)

## Ground rules (read first)
1. **The current code and documents were generated with an AI assistant** (see `ai-use-statement.md`). Neither of you should claim to have authored them. Your contribution statement must list what you actually do *from now on*: reviews, corrections, new features, tests, diagrams, analysis, presentation.
2. The instructor may ask **either member to explain any diagram or decision** (brief §2). Both of you must work through the "explain-it" checklist below, not only your own area.
3. Every change goes through a GitHub pull request reviewed by the other member. Commits are authored by the person who wrote them — never by an AI identity, and never one person committing as the other.
4. Keep the contribution log at the bottom of this file up to date; it becomes the signed contribution statement.

## Repository set-up — status on 1 November 2026
* **Public repository:** https://github.com/abdullahshammari796-ctrl/CampusShuttle (owner: Abdullah). At Abdullah's request, the AI assistant ran a public-release audit, created the repository from his account and imported the AI-assisted baseline in the initial commit `8d11ad60` (see `ai-use-statement.md`). Neither student's own work is in that commit.
* **Collaborator:** `zuhairhalawa` was invited with write access on 1 Nov 2026. Zuhair **accepted** the invitation on 1 Nov 2026; connected GitHub access confirms write permission.
* **Work items:** GitHub issues #1–#11, labelled `owner: Abdullah`, `owner: Zuhair` or `owner: both`; each one names its issue number below. Issues #5–#8 are now assigned to `zuhairhalawa`. PRs #12 and #13 record his AI-assisted implementation and verification work; human review is still required.
* **Still to do by Abdullah (issue #4):** protect `main` (pull request + one review, no force pushes) now that Zuhair has joined; agree on a licence (none yet). Issue assignment is complete.

## Ownership areas

| Area | Owner | Reviewer | What "owning" means |
|---|---|---|---|
| Architecture (report §6, ADRs, component & deployment diagrams) | Abdullah | Zuhair | Re-check the alternatives table with your own judgement; be able to defend every score |
| Analysis models (use cases, activity, SSD, state machines) | Zuhair | Abdullah | Check every use-case step against the running app; fix differences |
| Tracking & real-time code (`src/tracking`, `src/realtime`) | Abdullah | Zuhair | Understand ETA, snapping and signal states well enough to change them |
| Demand & forecasting (`src/demand`, `docs/demand-prediction.md`) | Zuhair | Abdullah | Explain the backtest; know why no ML model was trained |
| Security & privacy (`src/identity`, `docs/privacy-and-security.md`) | Abdullah | Zuhair | Walk through the threat table |
| UI and accessibility (`public/`) | Zuhair | Abdullah | Usability on a phone; accessibility fixes |
| Presentation & demo | both | both | Rehearse the demo script twice, timed |

## Suggested genuine contributions (each = one issue + one pull request)

### Abdullah
1. **Render and review all UML diagrams** (issue #1). Install the *PlantUML Integration* plugin in a JetBrains IDE (or the VS Code PlantUML extension), export every `docs/uml/*.puml` to `docs/uml/out/` as SVG, fix any rendering or notation problem you find, run `npm run docs:build`, and check the PDFs. *(The diagrams have never been rendered — this is real verification work.)*
2. **Field test on a phone** (issue #3). Serve the app over HTTPS on your LAN (e.g. a local reverse proxy with a development certificate), sign in as a driver on a phone, choose *This device's GPS*, walk a short route, and record what happens (accuracy, gaps, rejected positions). Write the findings into the test plan and adjust thresholds via environment variables if needed.
3. **"Shuttle approaching" notice for students** (optional part of issue #3). When a shuttle on a route serving the student's stop is two stops away (or < 2 min), show an in-page notice. Uses existing `vehicle` events; add unit tests for the rule.
4. **Re-score the architecture alternatives** (report §6.3) in your own words, and present that section (issue #2).

### Zuhair
1. **Validate the use-case descriptions against the app** (issue #5) (report Appendix A.2): run each scenario and extension, correct any mismatch in the document or file a bug.
2. **Add a fourth forecasting strategy** (issue #6) (e.g. same-weekday *median* over 6 weeks, more robust to outliers) as a new `DemandPredictor`, register it in `src/container.ts`, add unit tests, run `npm run evaluate` and report how it compares — this also demonstrates QA-7 (modifiability) for real.
3. **Browser tests, including the GPS simulator** (issue #7) (`public/js/gps.js`): stop placement, dwell at stops, outage behaviour, uploader backoff — runnable with `node --test`.
4. **Accessibility and Arabic support for the student page** (issue #8): keyboard and screen-reader check, contrast check in light and dark mode, and an Arabic (RTL) version of the student texts.

### Both
* Cross-review the ADRs (issue #9) and rehearse the demonstration (issue #10).
* Write the **Reflection** (report §9) in your own words (issue #11).
* Complete and sign the **contribution statement** and the **AI-use statement** ("what we changed").
* Confirm the outstanding facts: student IDs, proposal approval date, actual timeline, official presentation length and rubric.
* Rehearse the demo (`docs/demo-script.md`).

## "Explain-it" checklist (both members)
- [ ] Why a modular monolith and not microservices; what would make us change our mind
- [ ] How one GPS upload reaches 1,000 browsers (sequence diagram A.5)
- [ ] How an ETA is calculated, step by step, and what happens at a corner and on a two-way road
- [ ] The four signal states and their thresholds; why LOST shows no ETA
- [ ] What the driver app does when the network drops; how clock skew is corrected
- [ ] What each of the five patterns solves, and where it is in the code
- [ ] How the forecast for one stop-hour is computed; what MAE means; why the evaluation proves little
- [ ] What personal data is stored, why, and for how long
- [ ] How role checks work and what the CSRF header is for
- [ ] What the architecture test checks

## Contribution log (fill in as you go)

| Date | Member | Contribution (link to PR/issue) |
|---|---|---|
| 1 Nov 2026 | Zuhair Halawa (with ChatGPT assistance) | [PR #12](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/12): same-weekday median strategy, hand-computed tests and synthetic evaluation (#6). |
| 1 Nov 2026 | Zuhair Halawa (with ChatGPT Work assistance) | [PR #13](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/13): browser/GPS tests (#7), mobile/accessibility repairs (#8), waiting-state fixes and use-case evidence (#5), technical ADR review (#9), CI support (#4). 113 Node and 18 Chromium tests passed. Human review, acceptance and signatures remain outstanding. |
