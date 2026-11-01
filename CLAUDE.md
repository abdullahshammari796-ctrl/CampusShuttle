# CLAUDE.md — Campus Shuttle (BCS 305 course project)

Team: Abdullah (GitHub `abdullahshammari796-ctrl`, repository owner) and Zuhair Halawa (`zuhairhalawa`).
Read `README.md` for setup and `docs/00-requirements-traceability.md` for what is done and outstanding.

## Standing rules
- The repository is **public**: https://github.com/abdullahshammari796-ctrl/CampusShuttle (created 1 Nov 2026 at Abdullah's request). `main` is protected: changes land only through a pull request with Zuhair's (or Abdullah's) approving review and a passing `verify` check; never self-approve, bypass or weaken the protection. Anything committed and pushed there is published. Do **not** commit, push, deploy, change repository settings, create issues or pull requests, or change Git configuration unless Abdullah explicitly authorises that specific action. Never commit as Zuhair Halawa, and never work on a student's assigned issue unless that student asks.
- Before anything new is pushed, re-check it for secrets and personal data. A commit made on Abdullah's behalf uses his GitHub no-reply address and must say in its message that the AI assistant made it.
- Never attribute commits or co-authorship to Claude, Anthropic or any AI identity, and never impersonate a team member or invent contributions. AI use is disclosed only in `docs/team/ai-use-statement.md`, which must stay truthful.
- Never fabricate rubric details, signatures, dates, student IDs, timelines, real-world data or accuracy figures; mark missing information as **OUTSTANDING**. Synthetic demo data must stay labelled as synthetic.
- Keep documentation consistent with the code. `test/architecture.test.ts` checks only the allowed imports between components; it does not check UML operations, attributes, associations or messages. Compare and update the UML sources in `docs/uml/` by hand whenever classes, signatures or flows change.
- Verify before claiming: run `npm run typecheck` and `npm test`; report failures with their output.

## Commands
`npm start` · `npm test` · `npm run typecheck` · `npm run seed` · `npm run simulate -- --outage [--outage-at 30 --outage-for 75]` · `npm run load-test` · `npm run evaluate` · `npm run docs:build` · `npm run review:package`

## Permanent workflow — independent review package after EVERY task
Workflow: Claude Code → Abdullah → Zuhair → ChatGPT independent review → corrections. The reviewer inspects the actual files, so every completed task (development, bug fix, documentation, testing, architecture or verification) ends with a fresh review ZIP — without being reminded. Do this even when the task is incomplete or blocked, whenever it is safe to do so.

At the end of every task:
1. Finish the requested work and run the relevant verification.
2. Write the task's review notes to `../review-packages/notes/<YYYYMMDD-HHMM>-<task-slug>.md`. Use exactly these headings (the packaging script refuses notes without the required ones):
   - `## 1. What was requested`
   - `## 2. What was actually implemented`
   - `## 3. Files added, modified or removed` (optional commentary; the script computes the real list)
   - `## 4. Architecture or design decisions changed`
   - `## 5. Tests executed and their exact results` (optional: checks run outside the script, e.g. load tests)
   - `## 6. Problems discovered and fixed`
   - `## 7. Remaining bugs, limitations or blockers`
   - `## 8. Security-sensitive changes`
   - `## 9. Exact instructions for reproducing the work`
   - `## 10. Questions or decisions requiring review`
   - `## 12. Commits, pushes or deployments`

   Distinguish verified facts (with the command that verified them) from unverified claims.
3. Run `npm run review:package -- --task "<Task Name>" --notes "<notes file>"`. The script:
   - runs the type check and the full test suite and embeds their exact output; only exit code 0 (and, for tests, at least one test with none failed or cancelled) counts as PASSED, and skipped checks are reported as NOT RUN, never as passed;
   - scans for secrets and personal data — the project files **and** everything it generates (summary including these notes, inventory, logs, Git metadata) — and refuses to package (exit 2) if anything is not allowlisted. Generated text is first redacted of real local secrets (`data/session-secret`, secret-named environment variables), credentials in URLs and session tokens; every entry, binary files included, is also searched byte-for-byte for those real secrets. The reviewed allowlist is `scripts/review-allowlist.json`; never add unknown values just to make a run pass;
   - snapshots the whole project, excluding `node_modules`, `.git`, `data/`, `.env*` except `.env.example`, keys, databases, archives and instructor materials;
   - writes `REVIEW_SUMMARY.md` (sections 1–12, with section 3 computed against the previous package and section 11 from Git), plus a file inventory with SHA-256 checksums;
   - creates a new `../review-packages/CampusShuttle-Review-<YYYYMMDD-HHMM>-<Task>.zip`; it never overwrites an earlier one;
   - re-opens and verifies the archive with its own reader and with .NET `ZipFile`, re-scans every entry as written (and deletes the archive if that fails), and confirms the project files are unchanged;
   - writes `<zip>.sha256` and `<zip>.verification.txt` beside the archive.
4. If the script exits non-zero, report the exact reason — never claim the package succeeded. Exit 2 = refused (possible secret; nothing kept); exit 3 = archive written but a check FAILED or was NOT RUN.
5. End the response to Abdullah with the exact ZIP path, size and SHA-256.

Do not add review packages, notes or their logs to the project tree, and never put real credentials in `.env.example`.
