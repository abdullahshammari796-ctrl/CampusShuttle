# AI-use statement — factual record complete; personal parts OUTSTANDING

The project description (section 10) requires a statement of *which AI tools were used, for what, and what you changed*; the course introduction adds "which tool, which part, what you changed". This file is that statement. The factual record below comes from the Git log, the pull requests and `docs/test-plan.md` §4. What each member personally changed or verified is still **OUTSTANDING** (last section), as is any other tool a member used.

## Tools
* **Claude Code** (Anthropic), used from Abdullah's computer and, for GitHub, through the GitHub CLI that Abdullah signed in to himself.
* **ChatGPT** (OpenAI), including its Work mode, connected to Zuhair's GitHub account.

## Which parts, and what for
**Claude Code, at Abdullah's request (31 October – 10 November 2026):**
* **Baseline (31 Oct – 1 Nov):** read the project description, the Module 02 slides and the RBC Borealis article. Proposed the architecture recorded in the ADRs. Wrote the source code, automated tests, scripts and PlantUML sources. Drafted the proposal, report, UML set, ADRs, quality-attribute scenarios, test plan, demand, privacy and team documents, demo script and slides.
* **Verification and corrections:** ran the type checker, tests, load tests and browser walkthroughs, and fixed the defects they revealed: items 1–21 in `docs/test-plan.md` §4, including the corrections after Zuhair's reviews.
* **Repository:** ran the public-release audit, created the repository and made the commits from Abdullah's account (using his GitHub no-reply address). It also:
  * invited Zuhair and opened the issues;
  * verified, reviewed and merged pull requests #12–#16 from Abdullah's account, merged #17 after Zuhair's approval, and configured branch protection;
  * opened the owner pull requests #14–#17 and the submission pull request.

  Its reviews of #12 and #13 record the checks that were run; they do not claim that Abdullah read every line himself.
* **UML:** rendered the 16 diagrams on Abdullah's computer with the verified PlantUML jar (2 November 2026), and built the export validation and the PDF layout.
* **Final completion pass (6–7 November 2026):**
  * read the brief and the course slides on this computer, and mapped every submission condition to its evidence (`docs/00-requirements-traceability.md`);
  * wrote the technical assessment of options A–D and ADR-0001 to 0008 (`docs/architecture/technical-assessment.md`), which replaced the draft §6.3 scores;
  * wrote the report's timeline (§3.3), the draft retrospective (§9) and the factual contribution record (§10.1);
  * ran the browser walkthrough and the timed demo dry run, and fixed the office accessibility defects it revealed (item 17);
  * enlarged the separate UML-set PDF (item 18);
  * updated the slides and wrote the speaking script and demo runbook.
* **Submission pass (9–10 November 2026):**
  * merged PR #17 from Abdullah's account, pinned to the head Zuhair approved;
  * redrew the system sequence diagram as one scenario (item 20) and rebuilt the UML-set print layout (item 21);
  * rewrote the report's process section (§3) and corrected the records to the merged state;
  * produced the demonstration video. It wrote the scripts that record the running prototype in three separate browser windows (Playwright) with a throw-away demonstration database, generate the English narration and assemble the video and subtitles (FFmpeg) and print the transcript (Playwright). The narration is synthetic speech from the open Kokoro-82M model with its published voice `af_heart`, generated on Abdullah's computer without any online service. It is not either member's voice and does not imitate any real person;
  * rebuilt the presentation (nine slides and backup slides with speaker notes) and wrote the speaking script, the live-demo runbook and the viva sheet.

**ChatGPT, at Zuhair's request (1–7 November 2026):**
* Prepared PR #12, the same-weekday median forecaster with tests and evaluation (issue #6).
* Prepared PR #13: browser and simulator tests, accessibility and mobile fixes, waiting-state fixes, use-case evidence, the technical review of ADR-0001/0002/0003/0008 and the CI workflow (issues #5, #7, #8, #9).
* Reviewed PRs #14, #15 and #16 on a fresh Linux checkout, and PR #17 from its verified export (7 Nov; supplied as a review package because posting the review was refused with HTTP 403). This included:
  * the first render of the 16 UML sources;
  * reproductions of the export-validation defects;
  * independent decoder checks;
  * visual inspection of the PDFs and slides.

  Zuhair's reviews, including the [approval of #15](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15#pullrequestreview-5739614810), the [approval of #16](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/16#pullrequestreview-5742229877) and the comment review and [approval of PR #17's corrected head](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/17#pullrequestreview-5819503936) (8 Nov), were posted from his account. Whether a tool helped with the 8 November re-review is for him to state (**OUTSTANDING**).

## What changed after the baseline, and what found it
| Found by | What changed | Test plan §4 |
|---|---|---|
| Load test, integration tests, manual testing (31 Oct) | Corner snapping, work after shutdown, concurrent simulator start, dialog handling | items 1–4 |
| Independent review (1 Nov) | Trip ended locally without the server; live streams outlived their session; overclaims corrected; UML sources corrected; a flaky privacy test | items 5–9 |
| Zuhair's PR #13 browser tests (1 Nov) | Stale waiting-request state, keyboard focus loss, contrast, mobile layout | issue #5 and #8 sections |
| Owner review of PRs #12/#13 (1 Nov) | Device-GPS trip resumed as simulated; refresh amplification; dependency advisories; UML drift | items 10–13 |
| Zuhair's first render and his review of PR #15 (1–2 Nov) | Export checks that accepted empty, clipped and then malformed files; A.3 page layout | items 14, 16 |
| A failed browser run (2 Nov) | Credentials could reach a URL from the sign-in form | item 15 |
| Final pass walkthrough and measurements (6–7 Nov) | Office accessibility failures; UML-set print sizes; draft §6.3 scores corrected | items 17–18; report §6.3 |
| Zuhair's review of PR #17 (7 Nov, supplied as a package) | Authentication trade-off wording; the claim that every defect has a regression test; inconsistent slide times; "sign-on" wording on slide 13 | item 19 |
| Submission-pass checks against the Week 6 sheet and the printed sizes (10 Nov) | A system sequence diagram with two actors; UML-set text below 7 pt | items 20–21 |

## What the tools did not do
* They did not register the team, choose the topic, contact the instructor or submit anything for marking. Git and GitHub actions were taken only at the account owner's explicit request; nothing was committed as the other student. The app was not deployed, and no licence was chosen.
* They did not invent rubric details, signatures, student IDs, dates, contributions, field observations or real-world data. Missing information is marked **OUTSTANDING**, and all demo and historical data is labelled synthetic.
* Their walkthroughs, scans and dry run are tool-driven sessions. They are not a walkthrough, screen-reader session, paper inspection or rehearsal by either member.

## What each member changed, verified or added personally — OUTSTANDING
Complete this truthfully, in your own words. For example: which documents you rewrote, which diagrams you checked and corrected, which code you reviewed or changed, which tests you added, and which decisions you disagreed with and why.

| Member | AI tools you used yourself (if any) | What you changed / verified |
|---|---|---|
| Abdullah | | |
| Zuhair Halawa | | |
