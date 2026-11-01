// Builds the submission PDFs from the Markdown sources in docs/:
//   docs/build/proposal.pdf, docs/build/project-report.pdf, docs/build/uml-diagram-set.pdf
//
// Markdown → HTML (marked) → PDF (headless Microsoft Edge or Chrome, which
// every Windows machine already has). Diagrams are embedded from
// docs/uml/out/*.svg; a diagram that has not been rendered yet is replaced by
// a clearly marked placeholder so a PDF without diagrams cannot be mistaken
// for a finished one.
//
//   npm run docs:build                 (set EDGE_PATH if Edge/Chrome is elsewhere)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { PROJECT_ROOT } from '../src/config.ts';

const DOCS = resolve(PROJECT_ROOT, 'docs');
const BUILD = join(DOCS, 'build');
const UML_OUT = join(DOCS, 'uml', 'out');

const BROWSERS = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => Boolean(p));

const CSS = `
@page { size: A4; margin: 18mm 16mm; }
body { font: 10.5pt/1.45 "Segoe UI", Arial, sans-serif; color: #111827; }
h1 { font-size: 20pt; margin: 0 0 6pt; color: #0b5f59; }
h2 { font-size: 14pt; margin: 18pt 0 6pt; color: #0b5f59; border-bottom: 1px solid #d1d5db; padding-bottom: 3pt; break-after: avoid; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt; break-after: avoid; }
h4 { font-size: 10.5pt; margin: 10pt 0 3pt; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9pt; break-inside: auto; }
tr { break-inside: avoid; }
th, td { border: 1px solid #d1d5db; padding: 3pt 5pt; vertical-align: top; text-align: left; }
th { background: #f1f5f9; }
code { font-family: Consolas, monospace; font-size: 8.8pt; background: #f3f4f6; padding: 0 2pt; border-radius: 2pt; }
pre { background: #f3f4f6; padding: 6pt; font-size: 8.5pt; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; padding: 0; }
blockquote { margin: 8pt 0; padding: 6pt 10pt; background: #fff7e6; border-left: 3pt solid #f59e0b; }
figure { margin: 10pt 0; text-align: center; break-inside: avoid; }
figure img, figure svg { max-width: 100%; max-height: 235mm; height: auto; }
figcaption { font-size: 9pt; color: #4b5563; margin-top: 4pt; }
.placeholder { border: 2px dashed #dc2626; color: #991b1b; padding: 18pt; font-weight: 600; background: #fef2f2; }
.page-break { break-before: page; }
.title-page { text-align: center; padding-top: 60mm; }
.title-page h1 { font-size: 26pt; }
`;

interface DocSpec {
  output: string;
  title: string;
  sources: string[];
}

const SPECS: DocSpec[] = [
  { output: 'proposal', title: 'Project proposal', sources: ['01-proposal.md'] },
  { output: 'project-report', title: 'Project report', sources: ['02-project-report.md', '03-uml-diagram-set.md'] },
  { output: 'uml-diagram-set', title: 'UML diagram set', sources: ['03-uml-diagram-set.md'] },
];

let missingDiagrams = new Set<string>();

/** Replaces Markdown image references to rendered diagrams with figures (or placeholders). */
function embedDiagrams(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(uml\/out\/([\w.-]+)\.(svg|png)\)/g, (_m, caption: string, name: string) => {
    const svg = join(UML_OUT, `${name}.svg`);
    const png = join(UML_OUT, `${name}.png`);
    if (existsSync(svg)) return `<figure><img src="${pathToFileURL(svg).href}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`;
    if (existsSync(png)) return `<figure><img src="${pathToFileURL(png).href}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`;
    missingDiagrams.add(name);
    return `<figure><div class="placeholder">DIAGRAM NOT YET RENDERED: ${caption}<br><small>Source: docs/uml/${name}.puml — run "npm run uml", then rebuild.</small></div><figcaption>${caption}</figcaption></figure>`;
  });
}

function findBrowser(): string | null {
  return BROWSERS.find((p) => existsSync(p)) ?? null;
}

mkdirSync(BUILD, { recursive: true });
const browser = findBrowser();
if (!browser) console.warn('No Edge/Chrome found: HTML is built, PDFs are skipped. Set EDGE_PATH.');

for (const spec of SPECS) {
  missingDiagrams = new Set();
  const parts = spec.sources.map((file, i) => {
    const markdown = embedDiagrams(readFileSync(join(DOCS, file), 'utf8'));
    const html = marked.parse(markdown, { async: false }) as string;
    return i === 0 ? html : `<div class="page-break"></div>${html}`;
  });
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${spec.title}</title><style>${CSS}</style></head><body>${parts.join('\n')}</body></html>`;
  const htmlFile = join(BUILD, `${spec.output}.html`);
  writeFileSync(htmlFile, page);
  if (browser) {
    const pdfFile = join(BUILD, `${spec.output}.pdf`);
    const result = spawnSync(browser, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfFile}`, pathToFileURL(htmlFile).href], { stdio: 'pipe', timeout: 120_000 });
    if (result.status !== 0 || !existsSync(pdfFile)) console.error(`PDF generation failed for ${spec.output}: ${result.stderr?.toString() ?? ''}`);
    else console.log(`✔ ${pdfFile}`);
  }
  if (missingDiagrams.size) console.warn(`  ⚠ ${spec.output}: ${missingDiagrams.size} diagram(s) not rendered yet (${[...missingDiagrams].join(', ')})`);
}
