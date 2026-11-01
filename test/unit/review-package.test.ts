// Tests for the review-package building blocks (scripts/review-lib.ts).
// Fake secrets are assembled at run time so that this file itself never
// contains a value the packaging scanner would (rightly) refuse.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectKnownSecrets, gitState, interpretCheck, knownSecretHits, notRun, readZip, redactGenerated, scanText, writeZip,
} from '../../scripts/review-lib.ts';

const fakeGithubToken = 'ghp' + '_' + 'A1b2C3'.repeat(7);
const fakeKnownValue = 'local' + '-signing-' + 'k'.repeat(24);
const urlWithCredentials = 'https://' + 'someone:' + 'p4ssw0rd-' + 'xyz' + '@github.com/acme/repo.git';

const testOutput = (tests: number, pass: number, fail: number) =>
  `✔ a\n✖ b\nℹ tests ${tests}\nℹ suites 1\nℹ pass ${pass}\nℹ fail ${fail}\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n`;

describe('Review package: interpreting check results', () => {
  it('reports a failed test run as FAILED', () => {
    const r = interpretCheck('Automated tests', testOutput(83, 82, 1), 1);
    assert.equal(r.status, 'FAILED');
    assert.match(r.summary, /^FAILED \(exit code 1, 1 failed\)/);
  });

  it('does not trust exit code 0 alone for tests', () => {
    assert.equal(interpretCheck('Automated tests', testOutput(5, 4, 1), 0).status, 'FAILED', 'failures reported despite exit 0');
    assert.equal(interpretCheck('Automated tests', testOutput(0, 0, 0), 0).status, 'FAILED', 'no tests ran');
    assert.equal(interpretCheck('Automated tests', 'nothing useful', 0).status, 'FAILED', 'no summary in the output');
    assert.equal(interpretCheck('Automated tests', testOutput(82, 82, 0), null, 'SIGTERM').status, 'FAILED', 'killed by the timeout');
  });

  it('reports a clean run as PASSED and a failing type check as FAILED', () => {
    assert.equal(interpretCheck('Automated tests', testOutput(82, 82, 0), 0).status, 'PASSED');
    assert.equal(interpretCheck('Type check', '', 0).status, 'PASSED');
    assert.equal(interpretCheck('Type check', 'src/x.ts(1,1): error TS2322', 2).status, 'FAILED');
  });

  it('never presents a skipped check as completed', () => {
    const r = notRun('Automated tests', 'node --test', 'skipped with --skip-checks');
    assert.equal(r.status, 'NOT RUN');
    assert.equal(r.exitCode, null);
    assert.doesNotMatch(r.summary, /PASS/);
  });
});

describe('Review package: secret handling', () => {
  it('finds a token in generated text such as the summary or a log', () => {
    const findings = scanText('REVIEW_SUMMARY.md', Buffer.from(`notes: use ${fakeGithubToken} to push`), []);
    assert.deepEqual(findings.map((f) => f.rule), ['github-token']);
    assert.equal(findings[0].allowedBecause, undefined);
  });

  it('honours an allowlist entry only for its own rule, value and path', () => {
    const allow = [{ rule: 'credential-assignment', value: 'demo-only-value', path: 'test/a.ts', reason: 'test fixture' }];
    const line = Buffer.from(['const', 'password', '=', "'demo-only-value';"].join(' '));
    assert.equal(scanText('test/a.ts', line, allow)[0].allowedBecause, 'test fixture');
    assert.equal(scanText('review-logs/automated-tests.txt', line, allow)[0].allowedBecause, undefined, 'same value elsewhere is not allowed');
  });

  it('removes known local secrets, URL credentials and session tokens from generated text', () => {
    const known = [{ label: 'data/session-secret', value: fakeKnownValue }];
    const cookie = 'cs_session=' + 'eyJzdWIi'.repeat(4) + '.' + 'c2lnbmF0'.repeat(4);
    const { text, redactions } = redactGenerated(`key ${fakeKnownValue}\norigin ${urlWithCredentials} (push)\nCookie: ${cookie}`, known);
    assert.ok(!text.includes(fakeKnownValue));
    assert.ok(!text.includes('p4ssw0rd'));
    assert.ok(!text.includes('c2lnbmF0'));
    assert.match(text, /\[REDACTED data\/session-secret\]/);
    assert.match(text, /https:\/\/\[REDACTED\]@github\.com\/acme\/repo\.git/);
    assert.equal(redactions.length, 3);
    assert.deepEqual(scanText('log', Buffer.from(text), []), [], 'nothing left for the scanner to find');
  });

  it('strips credentials from Git remote URLs in the reported Git state', () => {
    const lines = gitState((args) => {
      const out: Record<string, string> = { 'rev-parse --is-inside-work-tree': 'true', 'rev-parse HEAD': 'abc123', 'rev-parse --abbrev-ref HEAD': 'main', 'status --porcelain': '', 'remote -v': `origin\t${urlWithCredentials} (fetch)` };
      return { status: 0, stdout: out[args.join(' ')] ?? '' };
    }).join('\n');
    assert.ok(!lines.includes('p4ssw0rd'));
    assert.match(lines, /origin\thttps:\/\/\[REDACTED\]@github\.com/);
  });

  it('reports a folder that is not a Git repository', () => {
    const lines = gitState(() => ({ status: 128, stdout: '' }));
    assert.match(lines[0], /not a Git repository/);
  });

  it('collects secret-looking environment variables and finds them even inside binary files', () => {
    const env = { SESSION_SECRET: fakeKnownValue, GH_TOKEN: 'short', PATH: fakeKnownValue + '-not-a-secret-name' };
    const known = collectKnownSecrets('Z:/no/such/project', env);
    assert.deepEqual(known.map((k) => k.label), ['environment variable SESSION_SECRET']);
    const binary = Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(fakeKnownValue), Buffer.from([0])]);
    assert.deepEqual(knownSecretHits([{ name: 'docs/x.pdf', data: binary }], known), [{ name: 'docs/x.pdf', label: 'environment variable SESSION_SECRET' }]);
    assert.deepEqual(scanText('docs/x.pdf', binary, []), [], 'pattern scan skips binary data, hence the exact search');
  });
});

describe('Review package: ZIP format', () => {
  it('round-trips entries with CRC-32 checks', () => {
    const entries = [
      { name: 'REVIEW_SUMMARY.md', data: Buffer.from('# summary\n'.repeat(50)), mtime: new Date(2026, 10, 1, 12, 0, 0) },
      { name: 'CampusShuttle/ä/ü.bin', data: Buffer.from([0, 255, 1, 254]), mtime: new Date(2026, 10, 1, 12, 0, 0) },
    ];
    const read = readZip(writeZip(entries));
    assert.deepEqual(read.map((e) => e.name), entries.map((e) => e.name));
    assert.ok(read.every((e) => e.crcOk));
    assert.deepEqual(read[1].data, entries[1].data);
  });
});
