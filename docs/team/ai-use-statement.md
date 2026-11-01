# AI-use statement — DRAFT (team to review and complete)

The project description requires a statement of *which AI tools were used, for what, and what you changed*. The factual record below was written by the AI assistant at the end of the session in which it produced the baseline; the team must check it, add any other AI use, and complete the last section.

## Tool
* **Claude Code** (Anthropic), desktop application; model **Claude Opus 5.5**. Used from Abdullah's computer and, for GitHub, through the GitHub CLI that Abdullah signed in to himself.
* **ChatGPT** (OpenAI), including its Work mode, connected to Zuhair's GitHub account (see Zuhair's entries below).

## Session
* Claude Code: 31 October – 1 November 2026, one continuous session started by the team with a written brief. It was later continued for the repository set-up and, on 1 November 2026, for the owner review requested in a written handoff that Abdullah submitted.
* ChatGPT: 1 November 2026, from Zuhair's side.

## What the AI assistant did
* Read the official project description (`Project_description.docx`), the Module 02 slides (`BCS305_02_SDLC.pptx`) and, through a web-reading helper, the RBC Borealis article on ML product development.
* Proposed and compared architecture alternatives, and chose the architecture recorded in the ADRs.
* Wrote all source code in `src/`, `public/` and `scripts/`, and all automated tests in `test/`.
* Ran the type checker, the tests, the load tests and a browser walkthrough of the three interfaces, and fixed the defects these revealed (listed in `docs/test-plan.md` §4).
* Wrote the PlantUML sources in `docs/uml/` (it could not render them: downloading PlantUML and using the public PlantUML server were both blocked by the environment's permission policy).
* Drafted the proposal, report, UML set document, ADRs, quality-attribute scenarios, test plan, demand-prediction and privacy documents, demo script, presentation slides and this team guidance.
* Built the review-package script and the workflow in `CLAUDE.md`.
* **Corrections after an independent review (1 November 2026).** Abdullah supplied the findings of an independent review (ChatGPT). In the same session, the assistant then:
  * reproduced and fixed the driver end-trip defect and the live-stream session-expiry defect, and added regression tests;
  * corrected the network-loss scenario (QA-4) and the load-test claims;
  * hardened the review-package script;
  * compared all 16 UML sources with the code and corrected them, with help from a read-only sub-agent;
  * re-ran the tests, load tests and a browser walkthrough.

  It downloaded the official PlantUML jar from Maven Central (checksums verified), but running it was blocked by the environment's permission policy, so the diagrams are still unrendered.

* **Repository preparation (1 November 2026).** At Abdullah's request it ran a public-release audit (secrets, personal data, document metadata, ignored files), initialised Git and made the initial import commit. The commit was made from Abdullah's GitHub identity, using his GitHub no-reply address, and its message states that the AI assistant made it and that it represents neither student's individual contribution.

* **GitHub set-up (1 November 2026).** At Abdullah's request, using the GitHub CLI that Abdullah signed in to himself, it:
  * created the **public** repository `abdullahshammari796-ctrl/CampusShuttle` and pushed the initial commit;
  * invited `zuhairhalawa` as a collaborator (he accepted later the same day);
  * opened issues #1–#11 describing work for each student and shared tasks, and made the documentation commit that records this.

  That setup session did not implement the assigned issues; subsequent work is recorded below.

* **Zuhair's issue #6 (1 November 2026).** At Zuhair's request, ChatGPT (OpenAI), connected to his GitHub account, prepared the six-week same-weekday median forecaster, added unit tests, reproduced the synthetic backtest with the project generator and backtest modules, and updated the architecture documentation and UML sources. The changes were made with AI assistance; Zuhair and Abdullah must review and be able to explain them. This is not a claim of independently hand-written student code or a completed human code review.

* **Zuhair’s Work-mode contributions (1 November 2026).** At Zuhair’s explicit request, ChatGPT Work verified the forecast branch under Node 24, opened PR #12, assigned issues #5–#8 to `zuhairhalawa`, and implemented substantive follow-up work: executable role/browser and simulated-GPS tests; mobile accessibility and keyboard fixes; waiting-request expiry/reconnect repairs; use-case/source evidence; and a technical ADR review. A GitHub Actions workflow automates the repeatable checks. Changes are published as AI-assisted contributions from Zuhair’s authenticated account, in his fork because the connected integration could not write upstream. This does not claim that Zuhair personally wrote the generated code, listened with a screen reader, performed field GPS testing, signed an architecture review, or approved a PR. Abdullah’s independent review and merge remain pending.

* **Owner review and integration (1 November 2026).** Abdullah requested this in a written handoff. Working from his account, Claude Code:
  * verified PRs #12 and #13 in clean worktrees on Node 24: type check, 109 and 113 Node tests, 18 Chromium tests, the evaluation and both audits;
  * checked Zuhair's fork CI runs and the pinned GitHub Actions;
  * submitted approving technical reviews from Abdullah's account. Each review states that it was prepared with AI assistance and is not a claim that Abdullah read every line;
  * merged both PRs with merge commits (`d0775d3`, `7dcab45`) made under Abdullah's GitHub no-reply address, keeping Zuhair's commits and authorship unchanged;
  * protected `main`: pull request, 1 approving review and the `verify` check required, also for admins; no force pushes or deletion.

  In the owner pull request from branch `abdullah/owner-completion`, it then:
  * fixed two defects found in the review, each with tests that fail on the previous code: reloaded device-GPS trips switched to simulated positions, and waiting students re-fetched their request whenever anyone joined their stop;
  * resolved the development-dependency audit findings;
  * wrote an evidence review of ADR-0004 to 0007 for Abdullah's side of issue #9;
  * reconciled the report, test plan, traceability, QA scenarios, use-case validation, demo script and these records with the merged code.

  It verified the PlantUML checksums again, but running PlantUML was again refused by the environment's permission policy, so the diagrams stayed unrendered that day (they were rendered on 2 November; see below). It requested Zuhair's review of the owner pull request (PR #14) and did not approve it.

* **Zuhair's review of PR #14 and the first UML render (1 November 2026).** At Zuhair's request, ChatGPT Work:
  * reviewed PR #14 on a fresh Linux checkout and posted his approving review, which discloses that assistance;
  * rendered all 16 unchanged PlantUML sources with the checksum-verified jar, which exposed empty and clipped PNG exports that the render script had accepted.

* **Integration and UML finalisation (2 November 2026).** Abdullah requested this in a written handoff. Working from his account, Claude Code:
  * merged PR #14 through the protected workflow (GitHub's rebase method, pinned to the approved head);
  * rendered all 16 diagrams on Abdullah's computer with the same verified jar, which his explicit authorisation now allowed;
  * made the render step validate its exports (jar hash, complete decoding, clipping, staleness), with three regression tests and a CI check;
  * made the PDF build print every diagram at a readable scale, using overview and detail pages;
  * corrected the adapter note;
  * reconciled the documents and records, and rebuilt the PDFs and deck;
  * opened a follow-up pull request for Zuhair's review.

## What it did not do
* It did not register the team, choose the topic on the team's behalf, contact the instructor or submit anything for marking. Git and GitHub actions were taken only when Abdullah explicitly asked (see above); Zuhair later requested issue #6 and published commits b5cbdbf and cb90511 under his own authenticated GitHub identity. ChatGPT continued verification and implementation at his request in Work mode. The app was not deployed.
* It did not act as Zuhair, approve its own pull request, close issues whose acceptance needs a person, deploy the application or choose a licence.
* It did not invent rubric details, signatures, student IDs, dates, contributions or real-world data. Missing information is marked **OUTSTANDING**; all demo and historical data is labelled synthetic/demonstration.

## What the team changed, verified or added
**OUTSTANDING — the team must complete this section truthfully**, e.g. which documents you rewrote, which diagrams you rendered and corrected, which code you reviewed or changed, which tests you added, and which decisions you disagreed with and why.

| Member | AI tools you used yourself (if any) | What you changed / verified |
|---|---|---|
| Abdullah | | |
| Zuhair Halawa | | |
