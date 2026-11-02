// Builds an independent-review ZIP of the whole project (see CLAUDE.md, "Permanent workflow").
//
//   npm run review:package -- --task "Task Name" --notes ../review-packages/notes/<file>.md
//   options: --out <dir> (default ../review-packages)  --skip-checks (do not run type check / tests)
//
// Uses only Node built-ins (zlib for the ZIP format, crypto for SHA-256). The script never writes
// inside the project: logs, summary and inventory exist only inside the archive, and the archive
// and its sidecar files are written to a folder that must be outside the project.
//
// Secrets: every entry that goes into the archive — project files AND the generated summary,
// inventory and logs — is scanned before anything is written; generated text is redacted first
// (known local secrets, credentials in URLs, session tokens). Any unresolved finding refuses the
// package (exit 2). Exit codes: 0 all verification passed, 3 a check failed or was not run.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AllowEntry, type CheckResult, type Finding, type ZipInput, RULES, collectKnownSecrets, csvCell, gitState, interpretCheck,
  knownSecretHits, mask, notRun, parseCsvLine, readZip, redactGenerated, scanText, sha256, writeZip,
} from './review-lib.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'CampusShuttle';
const GENERATOR = 'scripts/review-package.ts (v2)';
const PREFIX = `${PROJECT}/`; // project files keep their original paths under this folder in the ZIP

// ---------------------------------------------------------------- options

interface Options {
  task: string;
  notes: string;
  outDir: string;
  skipChecks: boolean;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
  };
  const task = get('--task');
  const notes = get('--notes');
  if (!task || !notes) fail('Usage: npm run review:package -- --task "Task Name" --notes <notes.md> [--out <dir>] [--skip-checks]');
  const outDir = resolve(get('--out') ?? join(ROOT, '..', 'review-packages'));
  if (isInside(outDir, ROOT)) fail(`The output folder must be outside the project (got ${outDir}).`);
  return { task, notes: resolve(notes), outDir, skipChecks: argv.includes('--skip-checks') };
}

function fail(message: string, code = 1): never {
  console.error(`REVIEW PACKAGE NOT CREATED: ${message}`);
  process.exit(code);
}

const isInside = (child: string, parent: string) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !rel.includes(':'));
};

// ---------------------------------------------------------------- what is packaged

const EXCLUDED_DIRS: Record<string, string> = {
  node_modules: 'third-party packages — reinstall with `npm install` (package-lock.json is included)',
  '.git': 'version-control internals',
  data: 'local SQLite database and generated session-signing secret — recreated by `npm start` / `npm run seed`',
  '.claude': 'local Claude Code tool configuration (not part of the application)',
  'review-packages': 'earlier review archives',
  coverage: 'temporary cache',
  'test-results': 'browser test traces and temporary screenshots (may contain sessions)',
  'playwright-report': 'generated browser report (may contain sessions)',
  '.cache': 'temporary cache',
  tmp: 'temporary files',
  temp: 'temporary files',
};

const EXCLUDED_FILES: Array<{ test: (rel: string, name: string) => boolean; reason: string }> = [
  { test: (_r, n) => n === '.env' || (n.startsWith('.env.') && n !== '.env.example'), reason: 'environment file that may hold real credentials (`.env.example` is included instead)' },
  { test: (_r, n) => /\.(pem|key|p12|pfx|crt|cer|jks)$/i.test(n) || /^id_(rsa|dsa|ecdsa|ed25519)/.test(n), reason: 'private key or certificate material' },
  { test: (_r, n) => /\.(db|db-wal|db-shm|db-journal|sqlite3?|bak|dump)$/i.test(n), reason: 'database file or backup' },
  { test: (_r, n) => n === 'session-secret', reason: 'generated signing secret' },
  { test: (_r, n) => /\.(zip|7z|rar|tar|gz|tgz)$/i.test(n), reason: 'archive — prevents nesting earlier review packages' },
  { test: (_r, n) => n.startsWith('~$') || n === 'Thumbs.db' || n === '.DS_Store' || n === 'desktop.ini', reason: 'editor lock file or OS cache' },
  { test: (_r, n) => /\.log$/i.test(n), reason: 'runtime log (may contain session data)' },
  { test: (r) => /^docs\/build\/.+\.html$/i.test(r), reason: 'intermediate HTML (the PDFs built from it are included)' },
  { test: (_r, n) => /project[_ -]?description|bcs305_02_sdlc/i.test(n), reason: 'instructor course material — copyrighted, not authorised for redistribution' },
];

/** Files the reviewer cannot do without; their absence fails verification. */
const REQUIRED = [
  'README.md', 'CLAUDE.md', 'package.json', 'package-lock.json', 'tsconfig.json', '.env.example',
  'src/main.ts', 'src/container.ts', 'public/index.html', 'test/architecture.test.ts',
  'docs/00-requirements-traceability.md', 'docs/01-proposal.md', 'docs/02-project-report.md', 'docs/03-uml-diagram-set.md',
  'docs/adr/README.md', 'docs/test-plan.md', 'docs/uml/01-use-case-diagram.puml',
];

interface ProjectFile {
  rel: string;
  abs: string;
  size: number;
  mtime: Date;
  sha256: string;
}

interface Walk {
  files: ProjectFile[];
  excluded: Array<{ rel: string; reason: string }>;
}

function walk(): Walk {
  const files: ProjectFile[] = [];
  const excluded: Walk['excluded'] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, entry.name);
      const rel = relative(ROOT, abs).split(sep).join('/');
      if (entry.isSymbolicLink()) {
        excluded.push({ rel, reason: 'symbolic link (not followed)' });
      } else if (entry.isDirectory()) {
        if (EXCLUDED_DIRS[entry.name]) excluded.push({ rel: `${rel}/`, reason: EXCLUDED_DIRS[entry.name] });
        else visit(abs);
      } else if (entry.isFile()) {
        const rule = EXCLUDED_FILES.find((r) => r.test(rel, entry.name));
        if (rule) {
          excluded.push({ rel, reason: rule.reason });
          continue;
        }
        const data = readFileSync(abs);
        const st = statSync(abs);
        files.push({ rel, abs, size: data.length, mtime: st.mtime, sha256: sha256(data) });
      }
    }
  };
  visit(ROOT);
  return { files, excluded };
}

// ---------------------------------------------------------------- checks (type check + tests)

function runCheck(label: string, args: string[]): CheckResult {
  const start = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60_000 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `\n[spawn error] ${r.error.message}` : ''}`;
  return { label, command: `node ${args.join(' ')}`, exitCode: r.status, durationMs: Date.now() - start, output, ...interpretCheck(label, output, r.status, r.signal) };
}

// ---------------------------------------------------------------- previous package (for "files changed")

function previousPackage(outDir: string, exclude: string): { name: string; inventory: Map<string, string> } | null {
  if (!existsSync(outDir)) return null;
  const zips = readdirSync(outDir)
    .filter((f) => /^CampusShuttle-Review-.*\.zip$/.test(f) && f !== exclude)
    .map((f) => ({ f, t: statSync(join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of zips) {
    try {
      const inv = readZip(readFileSync(join(outDir, f))).find((e) => e.name === 'REVIEW_INVENTORY.csv');
      if (!inv) continue;
      const map = new Map<string, string>();
      for (const line of inv.data.toString('utf8').split(/\r?\n/).slice(1)) {
        const cells = parseCsvLine(line);
        if (cells.length >= 3) map.set(cells[0], cells[2]);
      }
      return { name: f, inventory: map };
    } catch {
      /* unreadable archive: try the next older one */
    }
  }
  return null;
}

// ---------------------------------------------------------------- notes (author's narrative)

const REQUIRED_SECTIONS = [1, 2, 4, 6, 7, 8, 9, 10, 12];

function readNotes(file: string): Map<number, string> {
  if (!existsSync(file)) fail(`notes file not found: ${file}`);
  const text = readFileSync(file, 'utf8');
  const sections = new Map<number, string>();
  const parts = text.split(/^## +(\d+)\.[^\n]*$/m);
  for (let i = 1; i < parts.length; i += 2) sections.set(Number(parts[i]), parts[i + 1].trim());
  const missing = REQUIRED_SECTIONS.filter((n) => !sections.get(n));
  if (missing.length) fail(`notes file is missing required section(s): ${missing.map((n) => `"## ${n}."`).join(', ')} (see CLAUDE.md)`);
  return sections;
}

function refuseIfSecrets(findings: Finding[], hits: Array<{ name: string; label: string }>, stage: string): void {
  const blocked = findings.filter((f) => !f.allowedBecause);
  if (!blocked.length && !hits.length) return;
  console.error(`Possible secrets or personal data found in ${stage} (values masked):`);
  for (const f of blocked) console.error(`  ${f.rule}  ${f.rel}:${f.line}  ${mask(f.value)}`);
  for (const h of hits) console.error(`  known secret (${h.label}) appears in ${h.name}`);
  fail('remove these values (or, for a reviewed false positive in a project file, add an entry with a reason to scripts/review-allowlist.json), then rerun.', 2);
}

// ---------------------------------------------------------------- main

const opts = parseArgs(process.argv.slice(2));
const notes = readNotes(opts.notes);
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const slug = opts.task.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'Task';
mkdirSync(opts.outDir, { recursive: true });
let zipName = `${PROJECT}-Review-${stamp}-${slug}.zip`;
for (let n = 2; existsSync(join(opts.outDir, zipName)); n++) zipName = `${PROJECT}-Review-${stamp}-${slug}-${n}.zip`;
const zipPath = join(opts.outDir, zipName);

console.log(`Packaging ${ROOT}\n  task: ${opts.task}\n  archive: ${zipPath}`);

const allowFile = join(ROOT, 'scripts', 'review-allowlist.json');
const allow: AllowEntry[] = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : [];
const knownSecrets = collectKnownSecrets(ROOT, process.env);

// 0. The author's notes become part of REVIEW_SUMMARY.md: refuse early if they contain anything sensitive.
const notesData = readFileSync(opts.notes);
refuseIfSecrets(scanText('review notes', notesData, allow), knownSecretHits([{ name: 'review notes', data: notesData }], knownSecrets), 'the review notes');

const before = walk();
console.log(`  ${before.files.length} project files selected, ${before.excluded.length} path(s) excluded`);

// 1. Verification checks (their output goes into the archive only, after redaction).
const checks: CheckResult[] = [];
if (opts.skipChecks) {
  checks.push(notRun('Type check', 'tsc --noEmit', 'skipped with --skip-checks'));
  checks.push(notRun('Automated tests', 'node --test', 'skipped with --skip-checks'));
} else {
  const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  checks.push(existsSync(tsc) ? runCheck('Type check', [tsc, '--noEmit']) : notRun('Type check', 'tsc --noEmit', 'node_modules missing — run npm install'));
  checks.push(runCheck('Automated tests', ['--disable-warning=ExperimentalWarning', '--test', '--test-concurrency=1', 'test/**/*.test.ts']));
}
const redactionNotes: string[] = [];
for (const c of checks) {
  const cleaned = redactGenerated(c.output, knownSecrets);
  c.output = cleaned.text;
  for (const r of cleaned.redactions) redactionNotes.push(`${c.label} log: ${r}`);
  console.log(`  ${c.label}: ${c.summary}`);
}

// 2. The checks must not have changed any packaged file.
const afterChecks = walk();
const diffSets = (a: ProjectFile[], b: ProjectFile[]) => {
  const am = new Map(a.map((f) => [f.rel, f.sha256]));
  const bm = new Map(b.map((f) => [f.rel, f.sha256]));
  const changes: string[] = [];
  for (const [rel, h] of am) if (!bm.has(rel)) changes.push(`removed ${rel}`);
  else if (bm.get(rel) !== h) changes.push(`modified ${rel}`);
  for (const rel of bm.keys()) if (!am.has(rel)) changes.push(`added ${rel}`);
  return changes;
};
const changedByChecks = diffSets(before.files, afterChecks.files);
if (changedByChecks.length) fail(`running the checks changed project files: ${changedByChecks.join(', ')}`);
const files = afterChecks.files;
const projectEntries = files.map((f) => {
  const data = readFileSync(f.abs);
  if (sha256(data) !== f.sha256) fail(`${f.rel} changed while packaging; rerun.`);
  return { name: PREFIX + f.rel, rel: f.rel, data, mtime: f.mtime };
});

// 3. Secret and personal-data scan of the project files (patterns + exact search for local secrets).
const projectFindings = projectEntries.flatMap((e) => scanText(e.rel, e.data, allow));
refuseIfSecrets(projectFindings, knownSecretHits(projectEntries, knownSecrets), 'project files');
const missingRequired = REQUIRED.filter((r) => !files.some((f) => f.rel === r));

// 4. Files added / modified / removed since the previous package.
const previous = previousPackage(opts.outDir, zipName);
const changeLines: string[] = [];
if (!previous) {
  changeLines.push('No earlier review package was found, so this is the **baseline**: every packaged file is listed as added.');
}
const prevInv = previous?.inventory ?? new Map<string, string>();
const added = files.filter((f) => !prevInv.has(f.rel)).map((f) => f.rel);
const modified = files.filter((f) => prevInv.has(f.rel) && prevInv.get(f.rel) !== f.sha256).map((f) => f.rel);
const removed = [...prevInv.keys()].filter((rel) => !files.some((f) => f.rel === rel));
if (previous) changeLines.push(`Compared by SHA-256 with the previous package \`${previous.name}\`.`);
changeLines.push('', `**Added (${added.length})**`, ...(added.length ? added.map((r) => `- \`${r}\``) : ['- none']));
changeLines.push('', `**Modified (${modified.length})**`, ...(modified.length ? modified.map((r) => `- \`${r}\``) : ['- none']));
changeLines.push('', `**Removed (${removed.length})**`, ...(removed.length ? removed.map((r) => `- \`${r}\``) : ['- none']));

// 5. Summary and inventory.
const git = redactGenerated(gitState((args) => spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' })).join('\n'), knownSecrets);
for (const r of git.redactions) redactionNotes.push(`Git metadata: ${r}`);
const totalBytes = files.reduce((s, f) => s + f.size, 0);
const inventoryCsv = ['path,size_bytes,sha256', ...files.map((f) => [f.rel, f.size, f.sha256].map(csvCell).join(','))].join('\n') + '\n';
const section = (n: number) => notes.get(n) ?? '_No author notes for this section._';
const V = '**[Verified by the packaging script in this run]**';
const R = '**[Reported by the author — not independently verified by the script]**';
const logName = (c: CheckResult) => `review-logs/${c.label.toLowerCase().replace(/\s+/g, '-')}.txt`;
const checkTable = [
  '| Check | Status | Command | Exit code | Duration | Result |',
  '|---|---|---|---|---|---|',
  ...checks.map((c) => `| ${c.label} | **${c.status}** | \`${c.command}\` | ${c.exitCode ?? '—'} | ${(c.durationMs / 1000).toFixed(1)} s | ${c.summary} |`),
].join('\n');
const checksPassed = checks.every((c) => c.status === 'PASSED');
const checksVerdict = checksPassed ? 'all checks PASSED' : checks.some((c) => c.status === 'FAILED') ? '**at least one check FAILED**' : '**checks NOT RUN — nothing was verified by running code**';

const summary = `# Review summary — ${opts.task}

| | |
|---|---|
| Archive | \`${zipName}\` |
| Created | ${now.toString()} (UTC ${now.toISOString()}) |
| Generator | ${GENERATOR} |
| Project root (on the author's machine) | \`${ROOT}\` |
| Environment | Node ${process.version} · ${platform()} ${release()} ${arch()} |
| Packaged project files | ${files.length} files, ${(totalBytes / 1024).toFixed(1)} KiB, under \`${PREFIX}\` with their original relative paths |
| Checks at a glance ${V} | ${checks.map((c) => `${c.label}: **${c.status}**`).join(' · ')} — ${checksVerdict} |

**How to read this file.** Sections marked ${V} were produced or checked mechanically when this archive was built (file lists, checksums, test output, secret scan, Git state). Sections marked ${R} are the author's account of the work, taken from the notes file; treat them as claims to be checked against the files. Full logs are in \`review-logs/\`; the per-file inventory is \`REVIEW_INVENTORY.csv\` (also in the appendix below). The post-build verification of this archive cannot be inside the archive itself; it is written next to it as \`${zipName}.verification.txt\`, and the archive's checksum as \`${zipName}.sha256\`.

## 1. What was requested
${R}

${section(1)}

## 2. What was actually implemented
${R}

${section(2)}

## 3. Files added, modified or removed
${V}

${changeLines.join('\n')}
${notes.get(3) ? `\n**Author's commentary** ${R}\n\n${notes.get(3)}\n` : ''}
## 4. Architecture or design decisions changed
${R}

${section(4)}

## 5. Tests executed and their exact results
${V}

${checkTable}

Only exit code 0 counts as passed; a test run also needs at least one test and no failed or cancelled tests. A check that was not run is shown as **NOT RUN**, never as passed. Exact output: ${checks.map((c) => `\`${logName(c)}\``).join(', ')}.
${notes.get(5) ? `\n**Other verification reported by the author** ${R}\n\n${notes.get(5)}\n` : ''}
## 6. Problems discovered and fixed
${R}

${section(6)}

## 7. Remaining bugs, limitations or blockers
${R}

${section(7)}
${missingRequired.length ? `\n**Required files missing from this package** ${V}: ${missingRequired.map((r) => `\`${r}\``).join(', ')}\n` : ''}
## 8. Security-sensitive changes
${R}

${section(8)}

**Secret and personal-data scan** ${V}: every entry of this archive was scanned before it was written — the ${files.length} project files and the generated entries (this summary including the author's notes, the inventory and the logs). Pattern rules: ${RULES.map((r) => `\`${r.id}\``).join(', ')} (binary files such as images, PDFs and the PPTX cannot be pattern-scanned). In addition, every entry, binary files included, was searched byte-for-byte for the ${knownSecrets.length} real secret value(s) present on the build machine (${knownSecrets.map((s) => s.label).join(', ') || 'none found'}); values are never printed. Unresolved findings: **0** (the script refuses to package otherwise).

Redactions applied to generated text (project files are never altered): ${redactionNotes.length ? redactionNotes.join('; ') : 'none were needed'}.

Allowlisted findings in project files, each reviewed in \`scripts/review-allowlist.json\`:

${projectFindings.length ? ['| Rule | Location | Value (masked) | Why it is allowed |', '|---|---|---|---|', ...projectFindings.map((f) => `| ${f.rule} | \`${f.rel}:${f.line}\` | ${mask(f.value)} | ${f.allowedBecause} |`)].join('\n') : '_none_'}

**Excluded from this package** ${V}:

| Path | Reason / impact on verification |
|---|---|
${before.excluded.map((e) => `| \`${e.rel}\` | ${e.reason} |`).join('\n')}

## 9. Exact instructions for reproducing the work
${R}

${section(9)}

Standard reproduction (Node.js 24 LTS): unzip, then in \`${PROJECT}/\` run \`npm install\`, \`npm run typecheck\`, \`npm test\`, \`npm start\` (http://localhost:3000; demo accounts in README). To check file integrity, compare SHA-256 values with \`REVIEW_INVENTORY.csv\`.

## 10. Questions or decisions requiring review
${R}

${section(10)}

## 11. Git branch, HEAD and working-tree state
${V}

${git.text}

## 12. Commits, pushes or deployments
${R}

${section(12)}

## Appendix — file inventory
${V}

| Path | Size (bytes) | SHA-256 |
|---|---:|---|
${files.map((f) => `| \`${f.rel}\` | ${f.size} | \`${f.sha256}\` |`).join('\n')}
`;

// 6. Scan the generated entries too, then build the archive.
const generated: ZipInput[] = [
  { name: 'REVIEW_SUMMARY.md', data: Buffer.from(summary, 'utf8'), mtime: now },
  { name: 'REVIEW_INVENTORY.csv', data: Buffer.from(inventoryCsv, 'utf8'), mtime: now },
  ...checks.map((c) => ({
    name: logName(c),
    data: Buffer.from(`$ ${c.command}\n# cwd: ${PROJECT}/  exit code: ${c.exitCode ?? 'not run'}  duration: ${c.durationMs} ms  status: ${c.status}\n\n${c.output}`, 'utf8'),
    mtime: now,
  })),
];
refuseIfSecrets(generated.flatMap((e) => scanText(e.name, e.data, allow)), knownSecretHits(generated, knownSecrets), 'the generated summary, inventory or logs');
const entries: ZipInput[] = [...generated, ...projectEntries.map(({ name, data, mtime }) => ({ name, data, mtime }))];
const zip = writeZip(entries);
writeFileSync(zipPath, zip);
const zipSha = sha256(zip);

// 7. Verify the archive and the project.
type Outcome = 'PASS' | 'FAIL' | 'NOT RUN';
const results: Array<{ check: string; outcome: Outcome; detail: string }> = [];
const record = (check: string, ok: boolean, detail: string) => results.push({ check, outcome: ok ? 'PASS' : 'FAIL', detail });
record('Archive exists and is not empty', existsSync(zipPath) && statSync(zipPath).size > 0, `${statSync(zipPath).size} bytes`);
let archiveLeak = false;
try {
  const read = readZip(readFileSync(zipPath));
  record('Archive opens (built-in reader) and every entry passes its CRC-32 check', read.length === entries.length && read.every((e) => e.crcOk), `${read.length} entries`);
  const byName = new Map(read.map((e) => [e.name, e]));
  const mismatched = files.filter((f) => {
    const e = byName.get(PREFIX + f.rel);
    return !e || sha256(e.data) !== f.sha256;
  });
  record('Every project file in the archive matches its inventory SHA-256', mismatched.length === 0, mismatched.length ? mismatched.map((f) => f.rel).join(', ') : `${files.length} files`);
  const required = ['REVIEW_SUMMARY.md', 'REVIEW_INVENTORY.csv', ...REQUIRED.map((r) => PREFIX + r)];
  const absent = required.filter((r) => !byName.has(r));
  record('Expected files are present', absent.length === 0, absent.length ? `missing: ${absent.join(', ')}` : `${required.length} required entries present`);
  const nested = read.filter((e) => /\.(zip|7z|rar|tgz|gz)$/i.test(e.name) || e.name.includes('review-packages/'));
  record('No earlier review archives inside', nested.length === 0, nested.map((e) => e.name).join(', ') || 'none');
  const forbidden = read.filter((e) => /(^|\/)(node_modules|\.git|data)\//.test(e.name) || /(^|\/)\.env$/.test(e.name) || /\.(db|pem|key)$/i.test(e.name) || e.name.endsWith('session-secret'));
  record('No excluded or secret-bearing paths inside', forbidden.length === 0, forbidden.map((e) => e.name).join(', ') || 'none');
  // Re-scan what was actually written, generated entries included.
  const rescan = read.flatMap((e) => scanText(e.name.startsWith(PREFIX) ? e.name.slice(PREFIX.length) : e.name, e.data, allow));
  const unresolved = rescan.filter((f) => !f.allowedBecause);
  const rehits = knownSecretHits(read, knownSecrets);
  archiveLeak = unresolved.length > 0 || rehits.length > 0;
  record('Secret / personal-data re-scan of every entry as written (summary and logs included)', !archiveLeak,
    archiveLeak ? `${unresolved.length} unresolved pattern finding(s), ${rehits.length} known-secret hit(s)` : `${read.length} entries: 0 unresolved, ${rescan.length} allowlisted finding(s), 0 known-secret hits`);
} catch (error) {
  record('Archive opens (built-in reader)', false, (error as Error).message);
}
if (platform() === 'win32') {
  const ps = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z = [IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}'); try { $z.Entries.Count } finally { $z.Dispose() }`], { encoding: 'utf8' });
  const count = Number(ps.stdout.trim());
  record('Archive opens with an independent reader (.NET System.IO.Compression)', ps.status === 0 && count === entries.length, ps.status === 0 ? `${count} entries` : (ps.stderr || ps.error?.message || 'failed').trim());
}
const afterPackaging = walk();
const changedByPackaging = diffSets(files, afterPackaging.files);
record('Project files unchanged by packaging (re-hashed after writing)', changedByPackaging.length === 0, changedByPackaging.join(', ') || `${afterPackaging.files.length} files identical`);
for (const c of checks) results.push({ check: `${c.label} passed`, outcome: c.status === 'PASSED' ? 'PASS' : c.status === 'FAILED' ? 'FAIL' : 'NOT RUN', detail: c.summary });

if (archiveLeak) {
  unlinkSync(zipPath); // never leave an archive that failed its own secret scan
  fail('the written archive failed the secret re-scan and was deleted; see the findings above.', 2);
}

const failed = results.filter((r) => r.outcome === 'FAIL');
const notRunCount = results.filter((r) => r.outcome === 'NOT RUN').length;
const verdict = failed.length
  ? 'RESULT: ONE OR MORE CHECKS FAILED — do not treat this package as verified'
  : notRunCount
    ? `RESULT: INCOMPLETE — ${notRunCount} check(s) NOT RUN; the archive itself is intact but the code was not verified`
    : 'RESULT: ALL CHECKS PASSED';
const report = [
  `Verification of ${zipName}`,
  `Created: ${now.toISOString()}  Generator: ${GENERATOR}`,
  `Path: ${zipPath}`,
  `Size: ${zip.length} bytes`,
  `SHA-256: ${zipSha}`,
  '',
  ...results.map((r) => `[${r.outcome}] ${r.check} — ${r.detail}`),
  '',
  verdict,
].join('\n');
writeFileSync(`${zipPath}.sha256`, `${zipSha}  ${zipName}\n`);
writeFileSync(`${zipPath}.verification.txt`, `${report}\n`);
console.log(`\n${report}`);
process.exit(failed.length || notRunCount ? 3 : 0);
