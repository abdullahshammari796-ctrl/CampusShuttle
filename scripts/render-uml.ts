// Renders every docs/uml/*.puml diagram to SVG and PNG in docs/uml/out/ and
// records what was rendered in docs/uml/out/manifest.json.
//
// Needs Java 11+ and the PlantUML jar (Maven Central:
// net.sourceforge.plantuml:plantuml-mit). Graphviz is NOT needed: every layout
// diagram uses PlantUML's built-in "smetana" engine.
//
//   PLANTUML_JAR=C:\tools\plantuml-mit-1.2026.9.jar npm run uml
//   optional: JAVA=C:\path\to\java.exe  PLANTUML_LIMIT_SIZE=8192
//   another jar version: PLANTUML_JAR_SHA256=<its published SHA-256>
//
// The run fails (and leaves docs/uml/out/ untouched) unless the jar matches its
// expected SHA-256 and every new SVG parses as well-formed XML and every PNG
// decodes completely (scripts/uml-exports.ts), neither is clipped by
// the PNG size limit and matches its SVG's size. Exports are rendered into a
// fresh temporary folder, so files from an earlier run can never pass as new.
// `npm run uml:check` re-checks the committed exports without Java.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { PROJECT_ROOT } from '../src/config.ts';
import { type DiagramRecord, type ExportProblem, MANIFEST_FILE, type UmlManifest, checkExports, inspectDiagram, recordDiagram, sha256 } from './uml-exports.ts';

const EXPECTED_JAR_SHA256 = process.env.PLANTUML_JAR_SHA256 ?? 'e84e45b37ad3030cf802e7be18a687d209eca55733a5679b1f1f1a515f7f70dd'; // plantuml-mit 1.2026.9
const umlDir = resolve(PROJECT_ROOT, 'docs', 'uml');
const outDir = join(umlDir, 'out');
const jar = process.env.PLANTUML_JAR;
const java = process.env.JAVA ?? 'java';
const limitSize = Number(process.env.PLANTUML_LIMIT_SIZE ?? 8192);

function fail(message: string, problems: ExportProblem[] = []): never {
  for (const p of problems) console.error(`  ✖ ${p.file}: ${p.kind} — ${p.detail}`);
  console.error(message);
  process.exit(1);
}

if (!jar || !existsSync(jar)) fail('Set PLANTUML_JAR to the path of the PlantUML jar (see the comment at the top of scripts/render-uml.ts).');
const jarSha256 = sha256(readFileSync(jar));
if (jarSha256 !== EXPECTED_JAR_SHA256) fail(`The jar's SHA-256 is ${jarSha256}, expected ${EXPECTED_JAR_SHA256}. Download it again from Maven Central and compare it with the published .sha256, or set PLANTUML_JAR_SHA256 for another verified version.`);

const javaVersion = spawnSync(java, ['-version'], { encoding: 'utf8' });
if (javaVersion.status !== 0) fail(`Cannot run Java (${java}). Set JAVA to a Java 11+ executable.`);

const sources = readdirSync(umlDir).filter((f) => f.endsWith('.puml')).sort().map((f) => join(umlDir, f));
const names = sources.map((s) => basename(s, '.puml'));
const tmp = mkdtempSync(join(tmpdir(), 'campus-shuttle-uml-'));
try {
  for (const format of ['-tsvg', '-tpng']) {
    // -failfast2: syntax-check every diagram first and stop on the first error.
    const args = ['-Djava.awt.headless=true', `-DPLANTUML_LIMIT_SIZE=${limitSize}`, '-jar', jar, format, '-failfast2', '-charset', 'UTF-8', '-o', tmp, ...sources];
    const result = spawnSync(java, args, { stdio: 'inherit' });
    if (result.status !== 0) fail(`PlantUML failed (${format}, exit ${result.status}). Fix the reported diagram and run again; docs/uml/out/ was not changed.`);
  }

  const problems = names.flatMap((name) => inspectDiagram(tmp, name).problems);
  if (problems.length) fail(`${problems.length} export problem(s); docs/uml/out/ was not changed. A clipped PNG needs a larger PLANTUML_LIMIT_SIZE.`, problems);

  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(outDir).filter((f) => /\.(svg|png)$/.test(f) || f === MANIFEST_FILE)) unlinkSync(join(outDir, file));
  const diagrams: Record<string, DiagramRecord> = {};
  for (const name of names) {
    for (const ext of ['svg', 'png']) copyFileSync(join(tmp, `${name}.${ext}`), join(outDir, `${name}.${ext}`));
    diagrams[name] = recordDiagram(umlDir, outDir, name); // validates again and refuses invalid exports
  }
  const manifest: UmlManifest = {
    generator: 'scripts/render-uml.ts',
    renderedAt: new Date().toISOString(),
    renderer: { plantumlJar: basename(jar), jarSha256, java: (javaVersion.stderr || javaVersion.stdout).split(/\r?\n/)[0].trim(), limitSize },
    diagrams,
  };
  writeFileSync(join(outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

  const recheck = checkExports(umlDir, outDir, manifest);
  if (recheck.length) fail('The copied exports do not match the manifest.', recheck);
  console.log(`Rendered and verified ${names.length} diagrams (SVG + PNG, limit ${limitSize} px) to ${outDir}. Inspect every SVG, then run "npm run docs:build".`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
