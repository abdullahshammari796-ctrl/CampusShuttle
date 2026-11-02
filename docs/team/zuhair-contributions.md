# Zuhair contribution record

This record lists the work submitted from Zuhair's account and the reviews he posted. How the work was produced, including the tools used, is declared in `ai-use-statement.md`. This record makes no claim of unaided or hand-written work, and no signatures, personal reflections or field observations have been invented.

## Current status (2 November 2026)

| Issue / PR | Concrete contribution | Status |
|---|---|---|
| #6 — PR #12 | Six-week same-weekday median, six unit tests, synthetic evaluation, documentation and UML source; full 109-test verification | Reviewed from Abdullah's account and merged on 1 Nov 2026 (`d0775d3`). Issue closed. |
| #7 — PR #13 | Four simulator unit tests, five role scenarios and seven use-case checks in Chromium; a reusable isolated server and clock fixture | Reproduced on Windows 11 / Node 24.14.1 and merged on 1 Nov 2026 (`7dcab45`). Issue closed. Physical-device GPS stays with #3. |
| #8 — PR #13 | Contrast, interactive SVG semantics, named dialog, skip links, narrow layout, reduced motion, stable keyboard focus; six automated accessibility and keyboard checks | Merged. **Still open:** a real screen-reader session and a physical-device review. |
| #5 — PR #13 | UC1–UC5 evidence matrix and source corrections; repaired stale expiry/reconnect request state and a misleading timeout message | Merged. **Still open:** the team's own walkthrough of the source-checked steps, and review of the rendered diagrams. |
| #9 — PR #13 | Evidence-based technical review of ADR-0001, 0002, 0003 and 0008, with corrected overclaims | Merged. **Still open:** both members' own agreement or disagreement. |
| #4 support — PR #13 | Least-privilege GitHub Actions verification workflow (`verify`) | Merged. Since 1 Nov 2026 `verify` is a required check on the protected `main`. |
| Review of PR #14 | Independent Linux review (Node 24.22.1): type check, 114/114 Node tests, 21/21 Chromium 138 tests, evaluation and full audit; [approving review](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/14#pullrequestreview-5729974323) at head `96006f6` | PR #14 merged on 2 Nov 2026 (`f9327d4`). |
| UML rendering evidence (#1) | First render of all 16 unchanged sources with the checksum-verified PlantUML MIT 1.2026.9 (Java 17, Smetana); found empty PNGs (03, 06) and PNGs clipped at 4096 px (08, 09); supplied a hash manifest | The failures it found are detected by `npm run uml:check`. The committed exports were rendered on Abdullah's machine from the same sources and checked against this render. |
| Review of PR #15 | Independent Linux review of head `87aceaf`, then re-review of the corrections at `ebf4ba5` (details below) | [Changes requested](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15#pullrequestreview-5730257445) at `87aceaf`; [approved](https://github.com/abdullahshammari796-ctrl/CampusShuttle/pull/15#pullrequestreview-5739614810) at `ebf4ba5`; PR #15 merged on 2 Nov 2026 (`5232999`). |

### PR #15 review evidence
**First review, at head `87aceaf`:**
* type check, 117/117 Node tests, 22/22 Chromium 138 tests, UML checks, evaluation and audit;
* a reproducer and an independent Pillow decoder check, showing that the validator accepted a malformed SVG (unmatched `<g>`) and a PNG with an invalid scanline filter, even through the manifest check;
* visual inspection of all 41 UML-set pages, the report body, the proposal and all 14 slides, which found A.3's heading and introduction stranded on their own page.

**Corrections, at `ebf4ba5`:** Abdullah's corrections fixed the validator (test plan item 16) and the A.3 layout.

**Re-review, at `ebf4ba5`:**
* type check clean, 119/119 Node tests, 22/22 Chromium 138 tests, passing UML validation, unchanged synthetic median MAE 1.42, and zero full and production audit vulnerabilities;
* the original malformed fixtures now fail validation, including through the matching-hash manifest and recording paths;
* inspected: all 40 UML-set pages, report pages 1–20 and 25–32, the proposal and changed slide 13.

**Outcome:** the fresh approval was submitted from Zuhair's account for that exact head. PR #15 was merged with a merge commit (`5232999`) on 2 November 2026, keeping the reviewed commits; the resulting `main` tree is identical to the reviewed tree (`e2723f93`). The first review is kept as historical evidence. No paper or other human acceptance is claimed.

## History
On 1 November 2026, PR #12 (upstream branch) and PR #13 (from `zuhairhalawa/CampusShuttle:zuhair/verified-contributions`, because the connected integration could not write upstream) were submitted from Zuhair's account. That work recommended merging #13 after #12 with a merge commit, to keep the author records; it made no approvals, merges to `main`, deployments or course submission. Its results were 113/113 Node tests, 18/18 Chromium tests, the TypeScript check and the synthetic evaluation. The owner review reproduced them; its findings and fixes are in `docs/test-plan.md` §4 (defects 10–16).

This is technical completion of the documented automated scope, not a claim that every human or course requirement is complete.
