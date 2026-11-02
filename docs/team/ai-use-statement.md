# AI-use statement — DRAFT (team to review and complete)

The project description (section 10) requires a statement of *which AI tools were used, for what, and what you changed*. This file is that statement. The team must check the record below, add any other tools they used, and complete the last section. The detailed development history is in the Git log, the pull requests and `docs/test-plan.md` §4.

## Tools
* **Claude Code** (Anthropic), used from Abdullah's computer and, for GitHub, through the GitHub CLI that Abdullah signed in to himself.
* **ChatGPT** (OpenAI), including its Work mode, connected to Zuhair's GitHub account.

## What they were used for
**Claude Code, at Abdullah's request (31 October – 2 November 2026):**
* **Baseline:** read the project description, the Module 02 slides and the RBC Borealis article. Proposed the architecture recorded in the ADRs. Wrote the source code, automated tests, scripts and PlantUML sources. Drafted the proposal, report, UML set, ADRs, quality-attribute scenarios, test plan, demand, privacy and team documents, demo script and slides.
* **Verification and corrections:** ran the type checker, tests, load tests and browser walkthroughs, and fixed the defects they revealed. This includes the corrections after the independent reviews (test plan §4, defects 1–16).
* **Repository:** ran the public-release audit, created the repository and made the commits from Abdullah's account (using his GitHub no-reply address). It also:
  * invited Zuhair and opened the issues;
  * verified, reviewed and merged pull requests #12–#14 from Abdullah's account, and configured branch protection;
  * opened the owner pull requests #14, #15 and the documentation follow-up.

  Its reviews of #12 and #13 record the checks that were run; they do not claim that Abdullah read every line himself.
* **UML:** rendered the 16 diagrams on Abdullah's computer with the verified PlantUML jar (2 November 2026), and built the export validation and the PDF layout.

**ChatGPT, at Zuhair's request (1–2 November 2026):**
* Prepared PR #12, the same-weekday median forecaster with tests and evaluation (issue #6).
* Prepared PR #13: browser and simulator tests, accessibility and mobile fixes, waiting-state fixes, use-case evidence, the technical review of ADR-0001/0002/0003/0008 and the CI workflow (issues #5, #7, #8, #9).
* Reviewed PRs #14 and #15 on a fresh Linux checkout. This included:
  * the first render of the 16 UML sources;
  * reproductions of the export-validation defects;
  * independent decoder checks;
  * visual inspection of the PDFs and slides.

  Zuhair's reviews, including the [approval of #15](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15#pullrequestreview-5739614810), were posted from his account.

## What the tools did not do
* They did not register the team, choose the topic, contact the instructor or submit anything for marking. Git and GitHub actions were taken only at the account owner's explicit request; nothing was committed as the other student. The app was not deployed, and no licence was chosen.
* They did not invent rubric details, signatures, student IDs, dates, contributions, field observations or real-world data. Missing information is marked **OUTSTANDING**, and all demo and historical data is labelled synthetic.

## What the team changed, verified or added
**OUTSTANDING — the team must complete this section truthfully.** For example: which documents you rewrote, which diagrams you checked and corrected, which code you reviewed or changed, which tests you added, and which decisions you disagreed with and why.

| Member | AI tools you used yourself (if any) | What you changed / verified |
|---|---|---|
| Abdullah | | |
| Zuhair Halawa | | |
