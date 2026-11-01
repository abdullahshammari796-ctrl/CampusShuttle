// Renders every docs/uml/*.puml diagram to SVG and PNG in docs/uml/out/.
//
// Needs Java 11+ and the PlantUML jar (https://plantuml.com/download, or Maven
// Central: net.sourceforge.plantuml:plantuml-mit). Graphviz is NOT needed:
// every diagram uses PlantUML's built-in "smetana" layout engine.
//
//   PLANTUML_JAR=C:\tools\plantuml.jar npm run uml
//   (optional) JAVA=C:\path\to\java.exe
//
// Alternatives that need no command line: the "PlantUML" extension for
// VS Code, or the "PlantUML Integration" plugin for JetBrains IDEs — open a
// .puml file and export it as SVG/PNG into docs/uml/out/ with the same name.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { PROJECT_ROOT } from '../src/config.ts';

const umlDir = resolve(PROJECT_ROOT, 'docs', 'uml');
const outDir = join(umlDir, 'out');
const jar = process.env.PLANTUML_JAR;
const java = process.env.JAVA ?? 'java';

if (!jar || !existsSync(jar)) {
  console.error('Set PLANTUML_JAR to the path of plantuml.jar (see the comment at the top of scripts/render-uml.ts).');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const sources = readdirSync(umlDir).filter((f) => f.endsWith('.puml')).map((f) => join(umlDir, f));
for (const format of ['-tsvg', '-tpng']) {
  // -failfast2: syntax-check every diagram first and stop on the first error.
  const result = spawnSync(java, ['-Djava.awt.headless=true', '-jar', jar, format, '-failfast2', '-charset', 'UTF-8', '-o', outDir, ...sources], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`PlantUML failed (${format}). Fix the reported diagram and run again.`);
    process.exit(result.status ?? 1);
  }
}
const missing = sources.map((s) => basename(s, '.puml')).filter((name) => !existsSync(join(outDir, `${name}.svg`)) || !existsSync(join(outDir, `${name}.png`)));
if (missing.length) {
  console.error(`No SVG/PNG output for: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Rendered ${sources.length} diagrams to ${outDir}. Inspect every SVG, then run "npm run docs:build" to embed them in the PDFs.`);
