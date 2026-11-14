# Contribution statement — factual record and unsigned statement

BCS 305 Software Architecture · Course project · Campus Shuttle Tracking & Demand Prediction

> The project description requires a contribution statement listing what each member did, signed by all members; all members are expected to contribute substantively to the design, not only to the code. **Student IDs and signatures are added only in the private submission copy**, not in this public repository. Nothing below has been signed or attested on anyone's behalf.

## 1. Factual record (from Git and GitHub)
**Team (14 November 2026).** Abdullah shammari, Zuhair Hussein Halawa, Mubarak Al Khyeli and Ali Yosuf Ameer.
* Zuhair and Abdullah did the implementation and technical integration through their GitHub accounts.
* On 14 November Mubarak and Ali took on two documentation and verification tasks.
* Earlier commits and reviews stay recorded under the account that made them.

This records which account submitted, reviewed or merged what, as of 12 November 2026. It does **not** say who personally wrote, read or checked each line: the tools used are declared in `ai-use-statement.md`, and the generated baseline is not either member's own authored work. Sources: `git log`, pull requests #12–#18 and their reviews (the first PR #17 review as supplied in a package), `work-ownership-plan.md` (contribution log) and `zuhair-contributions.md`.

**Summaries, in comparable detail.**
* Each entry records what was submitted, reviewed or merged through that member's account; it is not a claim of personal authorship.
* Both accounts' work was prepared with AI tools at the member's own request: ChatGPT for Zuhair's account, Claude Code for Abdullah's (`ai-use-statement.md`).
* No percentage split is estimated, and no decision is described as joint.

### Zuhair Halawa (`zuhairhalawa`)
* [PR #12](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/12) added the six-week same-weekday median forecaster, with six unit tests and its synthetic evaluation.
* [PR #13](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/13) expanded the simulator, browser and accessibility coverage: four simulator unit tests, five role scenarios and seven use-case checks in Chromium. It also fixed waiting-state and accessibility defects and added the CI workflow.
* His first independent render of the UML sources exposed empty and clipped exports.
* His reviews found the export-validator defect and the A.3 layout problem ([#15](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15)), and four documentation errors ([#17](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17)).
* His account approved [#14](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/14), [#15](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15), [#16](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/16) and [#17](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17), and the corrected submission materials in [#18](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/18#pullrequestreview-5864742717).

### Abdullah (`abdullahshammari796-ctrl`)
* He set up the repository, imported the generated baseline, opened the work items as issues and protected `main`.
* His pull requests:
  * integrated GPS-trip recovery and waiting-list fixes ([#14](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/14));
  * corrected the UML validation, the print layout and the sign-in form ([#15](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15), [#17](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17), [#18](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/18));
  * fixed the office page's accessibility failures ([#17](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17));
  * delivered the report, the presentation and the demonstration materials ([#16](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/16), [#17](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17), [#18](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/18)).
* His account approved [#12](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/12) and [#13](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/13).
* It merged the team's pull requests #12–#18, each after the required approval and a passing `verify` check.

### Mubarak Al Khyeli
* **Assigned on 14 November:** test the setup instructions from a fresh copy of the source, start the app, and sign in with the student demo account. Then document how to confirm the first run (README, "Verify your first run").
* **Status:** result pending. This entry will describe what he actually did once his observation arrives.

### Ali Yosuf Ameer
* **Assigned on 14 November:** pick one stop and hour in the transport office's forecast, record its four historical counts, calculate their average and compare it with the value on screen. Then document it as a worked example in `docs/demand-prediction.md`.
* **Status:** result pending. This entry will describe what he actually did once his result arrives.

### Details by kind of work (GitHub accounts)

| | Abdullah (`abdullahshammari796-ctrl`) | Zuhair Halawa (`zuhairhalawa`) |
|---|---|---|
| Baseline (1 Nov) | Repository created and the generated baseline imported (`8d11ad6`); set-up commit `404238e`; issues #1–#11 opened | — |
| Pull requests submitted | #14, #15, #16, #17 (`abdullah/final-completion`) and #18 (`abdullah/submission-package`, 10 Nov; merged 12 Nov) | #12, #13 |
| Commits to 2 Nov, excluding merges | 14 (including `8d11ad6` and `404238e`) | 8 |
| Reviews posted | Approvals of #12 and #13. They were prepared with Claude Code and record the checks that were run, not a personal line-by-line reading | Approval of #14; changes requested on #15 and approval of its corrections; approval of #16. Review of #17 at `1a21cc6` (four findings) supplied as a package on 7 Nov, because posting it was refused with HTTP 403; a comment review ([5819352533](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17#pullrequestreview-5819352533)) and an [approval](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17#pullrequestreview-5819503936) of the corrected head `e040a17` posted on 8 Nov (UTC); [approval of #18](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/18#pullrequestreview-5864742717) at `92c2066` on 11 Nov (UTC), with two non-blocking notes |
| Repository administration | Branch protection on `main`; merges of #12–#18 (#17 on 9 Nov, `e989b97`; #18 on 12 Nov, `e68a4b6`) | — |
| Issues addressed (technical part) | #1 rendering, validation and PDF layout; #3 preparation (GPS-source resumption); #4 protection | #5, #6, #7, #8; #9 evidence review of ADR-0001, 0002, 0003 and 0008 |
| Independent verification | — | First render of the 16 UML sources (found empty and clipped exports); reproductions and an independent decoder check of the export validator; visual checks of PDFs and slides |

Still open for both members (they are human tasks, not technical ones): their own §6.3 scores and ADR views (#2, #9), the UML paper inspection (#1), the field test (#3), the screen-reader and device sessions (#8), their own use-case walkthrough (#5), the rehearsal (#10) and the team facts (#11).

## 2. Personal statements (each member confirms their own; signatures in the private copy)
List only work you actually did, in your own words. The instructor may ask any member to explain any diagram or decision.

| Member | Personal statement | Signature and date |
|---|---|---|
| Abdullah shammari | I set up the project repository and managed its review and merge workflow. Through my GitHub account, I submitted the fixes for GPS trip recovery, UML export validation, and diagram layout. I reviewed and merged the team’s changes and coordinated preparation of the report, presentation, recorded demo, and submission package. *(Confirmed by Abdullah, 14 Nov 2026.)* | *private copy only* |
| Zuhair Hussein Halawa | *Wording prepared; awaiting his confirmation* | *private copy only* |
| Mubarak Al Khyeli | *After his first-run check* | *private copy only* |
| Ali Yosuf Ameer | *After his forecast check* | *private copy only* |

We confirm that this statement is accurate and that each of us can explain the work attributed to us.
