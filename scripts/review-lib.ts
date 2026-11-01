// Building blocks of the review-package script (scripts/review-package.ts), kept
// separate so they can be unit-tested: secret scanning, redaction of generated
// text, check-result interpretation, Git state and a dependency-free ZIP format.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

// ---------------------------------------------------------------- secret / personal-data scan

export interface Finding {
  rule: string;
  rel: string;
  line: number;
  value: string;
  allowedBecause?: string;
}

export interface AllowEntry {
  rule: string;
  value: string;
  path?: string;
  reason: string;
}

export const RULES: Array<{ id: string; re: RegExp; group?: number }> = [
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { id: 'llm-api-key', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { id: 'session-token', re: /\bcs_session=([A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})/g, group: 1 },
  { id: 'bearer-token', re: /\bBearer\s+([A-Za-z0-9._~+/-]{20,}=*)/g, group: 1 },
  { id: 'credential-assignment', re: /\b(?:api[_-]?key|secret|token|passw(?:or)?d|pwd)\b["']?\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/gi, group: 1 },
  { id: 'url-with-credentials', re: /\b[a-z][a-z0-9+.-]*:\/\/([^\s:/@]+:[^\s@/]{3,}|[A-Za-z0-9_-]{20,})@/gi, group: 1 },
  { id: 'email-address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { id: 'emirates-id', re: /\b784-?\d{4}-?\d{7}-?\d\b/g },
  { id: 'uae-phone-number', re: /(?:\+971|\b00971|\b05\d)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b/g },
];

export const isBinary = (data: Buffer) => data.subarray(0, 8000).includes(0);

/** Pattern scan of one text file or generated entry; binary data is skipped (see knownSecretHits for those). */
export function scanText(rel: string, data: Buffer, allow: AllowEntry[]): Finding[] {
  if (isBinary(data)) return [];
  const findings: Finding[] = [];
  data.toString('utf8').split(/\r?\n/).forEach((text, i) => {
    for (const rule of RULES) {
      for (const m of text.matchAll(rule.re)) {
        const value = rule.group ? m[rule.group] : m[0];
        if (value.includes('${')) continue; // template-literal expression, not a literal value
        const hit = allow.find((a) => a.rule === rule.id && a.value === value && (!a.path || a.path === rel));
        findings.push({ rule: rule.id, rel, line: i + 1, value, allowedBecause: hit?.reason });
      }
    }
  });
  return findings;
}

export const mask = (v: string) => (v.length <= 4 ? '****' : `${v.slice(0, 3)}...(${v.length} chars)`);

/** A real secret present on this machine; only its label is ever printed. */
export interface KnownSecret {
  label: string;
  value: string;
}

const SECRET_ENV_NAME = /(SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL)/i;

/** Secrets that exist locally: the generated session-signing key and secret-looking environment variables. */
export function collectKnownSecrets(root: string, env: NodeJS.ProcessEnv): KnownSecret[] {
  const secrets: KnownSecret[] = [];
  const file = join(root, 'data', 'session-secret');
  if (existsSync(file)) {
    const value = readFileSync(file, 'utf8').trim();
    if (value.length >= 12) secrets.push({ label: 'data/session-secret', value });
  }
  for (const [name, value] of Object.entries(env)) {
    if (value && value.length >= 12 && SECRET_ENV_NAME.test(name)) secrets.push({ label: `environment variable ${name}`, value });
  }
  return secrets;
}

/** Exact byte search for every known secret in every entry, binary files included. */
export function knownSecretHits(entries: Array<{ name: string; data: Buffer }>, secrets: KnownSecret[]): Array<{ name: string; label: string }> {
  const hits: Array<{ name: string; label: string }> = [];
  for (const entry of entries) {
    for (const s of secrets) if (entry.data.includes(s.value)) hits.push({ name: entry.name, label: s.label });
  }
  return hits;
}

/**
 * Sanitises text the script itself generates (command output, Git metadata) —
 * never project files, which are packaged byte-for-byte or not at all.
 * Returns the cleaned text and what was removed (labels only).
 */
export function redactGenerated(text: string, secrets: KnownSecret[]): { text: string; redactions: string[] } {
  const redactions: string[] = [];
  let out = text;
  for (const s of secrets) {
    if (out.includes(s.value)) {
      out = out.split(s.value).join(`[REDACTED ${s.label}]`);
      redactions.push(s.label);
    }
  }
  const before = out;
  out = out.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@');
  if (out !== before) redactions.push('credentials embedded in a URL');
  const beforeCookie = out;
  out = out.replace(/\bcs_session=[^\s;'"]+/g, 'cs_session=[REDACTED]').replace(/\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g, 'Bearer [REDACTED]');
  if (out !== beforeCookie) redactions.push('session or bearer token');
  return { text: out, redactions };
}

// ---------------------------------------------------------------- checks (type check + tests)

export type CheckStatus = 'PASSED' | 'FAILED' | 'NOT RUN';

export interface CheckResult {
  label: string;
  command: string;
  exitCode: number | null;
  durationMs: number;
  output: string;
  status: CheckStatus;
  summary: string;
}

/**
 * Interprets a finished check. Only an exit code of 0 counts as passed, and a
 * test run additionally needs at least one test, no failures and no cancellations.
 */
export function interpretCheck(label: string, output: string, exitCode: number | null, signal: string | null = null): Pick<CheckResult, 'status' | 'summary'> {
  const pick = (name: string) => {
    const v = output.match(new RegExp(`^ℹ ${name} (\\d+)`, 'm'))?.[1];
    return v === undefined ? undefined : Number(v);
  };
  const tests = pick('tests');
  const why: string[] = [];
  if (signal) why.push(`killed by ${signal} (timeout?)`);
  if (exitCode !== 0) why.push(`exit code ${exitCode}`);
  let detail = exitCode === 0 ? 'no errors' : 'see log';
  if (tests !== undefined) {
    const [pass, fail, cancelled, skipped, todo] = ['pass', 'fail', 'cancelled', 'skipped', 'todo'].map(pick);
    detail = `tests ${tests}, pass ${pass}, fail ${fail}, cancelled ${cancelled}, skipped ${skipped}, todo ${todo}`;
    if (tests === 0) why.push('no tests ran');
    if (fail) why.push(`${fail} failed`);
    if (cancelled) why.push(`${cancelled} cancelled`);
  } else if (/test/i.test(label) && exitCode === 0) {
    why.push('test summary not found in the output');
  }
  return why.length ? { status: 'FAILED', summary: `FAILED (${why.join(', ')}) — ${detail}` } : { status: 'PASSED', summary: `PASSED — ${detail}` };
}

export const notRun = (label: string, command: string, reason: string): CheckResult => ({
  label, command, exitCode: null, durationMs: 0, output: `NOT RUN: ${reason}`, status: 'NOT RUN', summary: `NOT RUN — ${reason}`,
});

// ---------------------------------------------------------------- git state

export type GitRunner = (args: string[]) => { status: number | null; stdout: string; error?: Error };

/** Git branch / HEAD / working tree / remotes, with any credentials in remote URLs removed. */
export function gitState(run: GitRunner): string[] {
  const inside = run(['rev-parse', '--is-inside-work-tree']);
  if (inside.error) return [`Git is not available on this machine (${inside.error.message}).`];
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    return ['The project folder is **not a Git repository** (`git rev-parse --is-inside-work-tree` failed). There is no branch, no HEAD and no remote, so no commit or push can have been made from it.'];
  }
  const head = run(['rev-parse', 'HEAD']);
  const changed = run(['status', '--porcelain']).stdout.split('\n').filter(Boolean);
  const remotes = redactGenerated(run(['remote', '-v']).stdout.trim(), []).text;
  return [
    `Branch: \`${run(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()}\``,
    `HEAD: \`${head.status === 0 ? head.stdout.trim() : 'no commits yet'}\``,
    `Working tree: ${changed.length === 0 ? 'clean' : `${changed.length} changed/untracked path(s)`}`,
    `Remotes (credentials removed): ${remotes ? `\n\`\`\`\n${remotes}\n\`\`\`` : 'none'}`,
    ...(changed.length ? ['```', ...changed.slice(0, 200), '```'] : []),
  ];
}

// ---------------------------------------------------------------- ZIP writer and reader (no dependencies)

export interface ZipInput {
  name: string;
  data: Buffer;
  mtime: Date;
}

function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  };
}

export function writeZip(entries: ZipInput[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data) >>> 0;
    const deflated = deflateRawSync(e.data, { level: 9 });
    const stored = deflated.length >= e.data.length;
    const body = stored ? e.data : deflated;
    const method = stored ? 0 : 8;
    const { date, time } = dosDateTime(e.mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 file names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += local.length + name.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  if (entries.length > 0xffff || offset > 0xffffffff) throw new Error('Archive too large for this simple ZIP writer (needs ZIP64).');
  return Buffer.concat([...chunks, cdBuf, end]);
}

export interface ZipEntry {
  name: string;
  data: Buffer;
  crcOk: boolean;
}

export function readZip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('end-of-central-directory record not found');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory header at ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(start, start + compSize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    entries.push({ name, data, crcOk: (crc32(data) >>> 0) === crc });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// ---------------------------------------------------------------- CSV

export const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (line.length) out.push(cur);
  return out;
}
