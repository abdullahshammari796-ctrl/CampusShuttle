# AI-use statement — DRAFT (team to review and complete)

The project description requires a statement of *which AI tools were used, for what, and what you changed*. The factual record below was written by the AI assistant at the end of the session in which it produced the baseline; the team must check it, add any other AI use, and complete the last section.

## Tool
* **Claude Code** (Anthropic), desktop application; model **Claude Opus 5.5**.

## Session
* 31 October – 1 November 2026, one continuous session started by the team with a written brief.

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
  * invited `zuhairhalawa` as a collaborator (pending until he accepts);
  * opened issues #1–#11 describing work for each student and shared tasks, and made the documentation commit that records this.

  That setup session did not implement the assigned issues; subsequent work is recorded below.

* **Zuhair's issue #6 (1 November 2026).** At Zuhair's request, ChatGPT (OpenAI), connected to his GitHub account, prepared the six-week same-weekday median forecaster, added unit tests, reproduced the synthetic backtest with the project generator and backtest modules, and updated the architecture documentation and UML sources. The changes were made with AI assistance; Zuhair and Abdullah must review and be able to explain them. This is not a claim of independently hand-written student code or a completed human code review.

## What it did not do
* It did not register the team, choose the topic on the team's behalf, contact the instructor or submit anything for marking. Git and GitHub actions were taken only when Abdullah explicitly asked (see above); Zuhair later requested issue #6 and published commits b5cbdbf and cb90511 under his own authenticated GitHub identity. ChatGPT continued verification and implementation at his request in Work mode. The app was not deployed.
* It did not invent rubric details, signatures, student IDs, dates, contributions or real-world data. Missing information is marked **OUTSTANDING**; all demo and historical data is labelled synthetic/demonstration.

## What the team changed, verified or added
**OUTSTANDING — the team must complete this section truthfully**, e.g. which documents you rewrote, which diagrams you rendered and corrected, which code you reviewed or changed, which tests you added, and which decisions you disagreed with and why.

| Member | AI tools you used yourself (if any) | What you changed / verified |
|---|---|---|
| Abdullah | | |
| Zuhair Halawa | | |
