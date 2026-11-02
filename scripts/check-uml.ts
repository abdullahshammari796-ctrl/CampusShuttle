// Re-checks the committed UML exports without Java: every docs/uml/*.puml must
// have an SVG and a PNG that decode completely, are not clipped, and were
// rendered from the current source (docs/uml/out/manifest.json). Exit 1 otherwise.
//
//   npm run uml:check
import { join, resolve } from 'node:path';
import { PROJECT_ROOT } from '../src/config.ts';
import { checkExports, readManifest } from './uml-exports.ts';

const umlDir = resolve(PROJECT_ROOT, 'docs', 'uml');
const outDir = join(umlDir, 'out');
const manifest = readManifest(outDir);
const problems = checkExports(umlDir, outDir, manifest);
if (problems.length) {
  for (const p of problems) console.error(`✖ ${p.file}: ${p.kind} — ${p.detail}`);
  console.error(`${problems.length} UML export problem(s). Render again with "npm run uml".`);
  process.exit(1);
}
console.log(`All ${Object.keys(manifest!.diagrams).length} diagrams have well-formed SVG and fully decoded PNG exports, unclipped and rendered from their current sources (${manifest!.renderer.plantumlJar}, ${manifest!.renderedAt}).`);
