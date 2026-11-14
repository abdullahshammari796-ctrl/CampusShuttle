# Suggested work-ownership plan (Abdullah & Zuhair)

## Ground rules (read first)
1. **The baseline code and documents are not either student's own work** (see `ai-use-statement.md`). Neither of you should claim to have authored them. Your contribution statement must list what you actually do *from now on*: reviews, corrections, new features, tests, diagrams, analysis, presentation.
2. The instructor may ask **either member to explain any diagram or decision** (brief §2). Both of you must work through the "explain-it" checklist below, not only your own area.
3. Every change goes through a GitHub pull request reviewed by the other member. Commits are authored by the person who wrote them — never by an AI identity, and never one person committing as the other.
4. Keep the contribution log at the bottom of this file up to date; it becomes the signed contribution statement.

## Repository set-up — status on 1 November 2026
* **Public repository:** https://github.com/abdullahshammari796-ctrl/CampusShuttle (owner: Abdullah). A public-release audit was run, and the repository was created from Abdullah's account with the baseline imported in the initial commit `8d11ad60` (see `ai-use-statement.md`). Neither student's own work is in that commit.
* **Collaborator:** `zuhairhalawa` was invited with write access on 1 Nov 2026. Zuhair **accepted** the invitation on 1 Nov 2026; connected GitHub access confirms write permission.
* **Work items:** GitHub issues #1–#11, labelled `owner: Abdullah`, `owner: Zuhair` or `owner: both`; each one names its issue number below. Issues #5–#8 are now assigned to `zuhairhalawa`. PRs #12 and #13 record his implementation and verification work; both were reviewed and merged on 1 Nov 2026.
* **Branch protection (issue #4), 1 Nov 2026:** `main` now requires a pull request with 1 approving review and a passing `verify` check (GitHub Actions), with the branch up to date. The rule also applies to admins; force pushes and deletion are blocked. Issue assignment is complete. **Still open:** agree on a licence (none yet).

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
1. **Render and review all UML diagrams** (issue #1). Install the *PlantUML Integration* plugin in a JetBrains IDE (or the VS Code PlantUML extension), export every `docs/uml/*.puml` to `docs/uml/out/` as SVG, fix any rendering or notation problem you find, run `npm run docs:build`, and check the PDFs. *(Historical: when this plan was written on 1 Nov 2026 no diagram had been rendered. Rendering and export validation were completed in PR #15 on 2 Nov 2026; Abdullah's own inspection, on screen and on paper, is still open.)*
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
| 1 Nov 2026 | Zuhair Halawa | [PR #12](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/12): same-weekday median strategy, hand-computed tests and synthetic evaluation (#6). |
| 1 Nov 2026 | Zuhair Halawa | [PR #13](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/13): browser/GPS tests (#7), mobile/accessibility repairs (#8), waiting-state fixes and use-case evidence (#5), technical ADR review (#9), CI support (#4). 113 Node and 18 Chromium tests passed. Human review, acceptance and signatures remain outstanding. |
| 1 Nov 2026 | Abdullah | Technical review, approval and merge of [PR #12](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/12) and [PR #13](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/13) (merge commits `d0775d3`, `7dcab45`); branch protection (#4). Owner pull request from `abdullah/owner-completion`: GPS-source resumption after reload (#3 preparation), waiting-refresh fix, development-dependency fix, ADR-0004–0007 evidence review (#9), documentation reconciliation. Merged as PR #14 on 2 Nov 2026 after Zuhair's approving review. |
| 1 Nov 2026 | Zuhair Halawa | Independent review and approval of [PR #14](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/14); first render of the 16 UML sources, with an export hash manifest that exposed empty and clipped PNGs (evidence for #1). |
| 2 Nov 2026 | Abdullah | Merge of PR #14. Owner follow-up pull request from `abdullah/uml-and-docs-finalization`: validated UML rendering (`npm run uml`, `npm run uml:check`), readable diagram pages in the PDFs, adapter note, and reconciliation of documents and records (#1). Corrections after Zuhair's review: content-level export validation, A.3 layout. Merged as PR #15 on 2 Nov 2026 (merge commit `5232999`) after Zuhair's fresh approval. |
| 2 Nov 2026 | Zuhair Halawa | Independent review of PR #15 at `87aceaf`: a reproduction of the validator defect, an independent decoder check and a visual inspection of the PDFs and slides; [changes requested](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15#pullrequestreview-5730257445). |
| 2 Nov 2026 | Zuhair Halawa | Re-review of the PR #15 corrections at `ebf4ba5`: the original malformed fixtures rejected, independent decoder checks of all 32 exports, full checks and visual inspection; [approved](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15#pullrequestreview-5739614810). |
| 2 Nov 2026 | Abdullah | Merge of PR #15 (`5232999`). Documentation follow-up from `abdullah/docs-wording-and-records`: the contribution-table fix, project-focused wording, a concise AI-use statement, and test-plan and report date corrections. Approved by Zuhair ([review 5742229877](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/16#pullrequestreview-5742229877)) and merged as PR #16 on 2 Nov 2026 (merge commit `695eb88`); `main` CI run 41514123139 passed. |
| 2 Nov 2026 | Zuhair Halawa | Independent review and approval of [PR #16](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/16#pullrequestreview-5742229877) at `052ae3b` (Linux, Node 24.22.1, Chromium 138; 119/119 Node tests and 22/22 Chromium tests in one full run). He also edited the wording of his own PR #12 and #13 descriptions and of reviews 5729974323, 5730257445 and 5739614810. |
| 6–7 Nov 2026 | Abdullah | Final completion pull request from `abdullah/final-completion`: requirement-to-evidence mapping, technical assessment of options A–D and ADR-0001 to 0008, timeline, retrospective draft, factual contribution and tool-use records, office accessibility fixes (test-plan item 17), UML-set print layout (item 18), browser walkthrough and timed demo dry run, speaking script and demo runbook. Opened as [PR #17](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17) at `1a21cc6`. |
| 7 Nov 2026 | Zuhair Halawa | Independent review of PR #17 at `1a21cc6` (Linux, Node 24.22.1): verified both supplied ZIPs and every inventoried file against the Git tree; ran the type check, 119/119 Node tests, the UML check, the evaluation and both audits (CI run 42287618174 passed); inspected all 47 UML-set pages, all 14 slides and the report body; made four documentation findings (test plan item 19). His local browser run failed at the browser installation, before any application assertion. The review was supplied as a package; posting it on GitHub was refused (HTTP 403), so it is **not** a GitHub review or approval. |
| 7 Nov 2026 | Abdullah | Corrections for the PR #17 review findings, on the same pull request: the ADR-0006 trade-off wording, the defect-verification claim in the speaking script, one consistent 12:00 timing budget, and "university single sign-on" on slides 13 and 14. Deck rebuilt; new head `e040a17`. |
| 8 Nov 2026 | Zuhair Halawa | Re-review of PR #17 at `e040a17`: all four findings resolved; posted as a [comment review](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17#pullrequestreview-5819352533), then [approved](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17#pullrequestreview-5819503936) on GitHub (CI run 42360091616 passed on that head). |
| 9 Nov 2026 | Abdullah | Merge of PR #17 with a merge commit pinned to the approved head (`e989b97`, tree identical to the approved tree); `main` CI run 42682626360 passed. |
| 10 Nov 2026 | Abdullah | Submission pull request from `abdullah/submission-package`: single-scenario system sequence diagram (test plan item 20), UML-set PDF with every diagram's smallest text at about 7 pt (item 21), the report's process section (§3) and records corrected to the merged state, the recorded demonstration video, the nine-slide presentation with speaker notes, the speaking script, the live-demo runbook and the viva sheet. |
| 11 Nov 2026 | Zuhair Halawa | [Approval of PR #18](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/18#pullrequestreview-5864742717) at `92c2066`: compared the submission source with the reviewed tree; inspected the exported slides and the private presentation copy (slide 7 embeds the same MP4); checked that the recording decodes with captions and that the network-recovery and GPS-loss sequences are clearly distinguished. Two non-blocking notes: an 8-minute plan that keeps both live demonstrations; "about 7 pt" for the smallest UML labels, because the PDF measures about 6.93 pt on some detail pages. |
| 12 Nov 2026 | Abdullah | Merge of PR #18 with a merge commit pinned to the approved head (`e68a4b6`, tree identical to the approved tree); `main` CI run 43187586020 passed. Documentation pull request from `abdullah/readme-media-and-credits`: the README animation and screenshot gallery, comparable contribution summaries, the two notes from the PR #18 review, and the four-member roster and speaking plan. |
| 12 Nov 2026 | Zuhair Halawa | Requested the README animation and supplied it, with the README section text, in a media handoff. Codex in ChatGPT Work created the animation (see `ai-use-statement.md`). |
| 14 Nov 2026 | Mubarak Al Khyeli | Assigned: a first-run check of the setup instructions from a fresh copy of the source, for a "Verify your first run" paragraph in the README. Result pending. |
| 14 Nov 2026 | Ali Yosuf Ameer | Assigned: check one displayed forecast against its four historical counts and document it as a worked example. Result pending. |
