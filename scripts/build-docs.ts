// Builds the submission PDFs from the Markdown sources in docs/:
//   docs/build/proposal.pdf, docs/build/project-report.pdf, docs/build/uml-diagram-set.pdf
//
// Markdown → HTML (marked) → PDF (headless Microsoft Edge or Chrome, which
// every Windows machine already has). Diagrams are embedded from
// docs/uml/out/*.svg only if `npm run uml:check` would accept them (complete,
// unclipped, rendered from the current source); otherwise a clearly marked
// placeholder says why, so a PDF without valid diagrams cannot be mistaken for
// a finished one.
//
// Print readability: a diagram is never printed below MIN_SCALE of its rendered
// size. One that fits a portrait or landscape A4 page at that scale gets one
// figure; a larger one gets a vector overview page (zoomable on screen) followed
// by overlapping detail pages printed at MIN_SCALE or more.
//
//   npm run docs:build                 (set EDGE_PATH if Edge/Chrome is elsewhere)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { PROJECT_ROOT } from '../src/config.ts';
import { type ExportProblem, checkExports, svgSize } from './uml-exports.ts';

const DOCS = resolve(PROJECT_ROOT, 'docs');
const BUILD = join(DOCS, 'build');
const UML_OUT = join(DOCS, 'uml', 'out');

/** Smallest print scale of a rendered diagram: its 14 px labels then print at about 6.3 pt. */
const MIN_SCALE = 0.6;
/** Diagram pixels repeated at the edges of neighbouring detail pages, so most boxes appear whole on one of them. */
const OVERLAP = 200;
/**
 * Height (CSS px) kept free on a diagram's first page for the heading and the
 * short introduction moved onto it: the heading itself, plus one 10.5 pt line
 * (about 21 px) per CHARS_PER_LINE characters of introduction. A fixed allowance
 * let A.3's five-line introduction push its overview onto the next page.
 */
const HEADING_ROOM = 60;
const INTRO_LINE = 21;
const CHARS_PER_LINE = { portrait: 90, landscape: 135 } as const;
/** Extra caption height of an overview page: its caption has a second, explanatory line. */
const OVERVIEW_CAPTION = 24;
/** Image area (CSS px) of a page of its own: A4 minus margins and a caption line. */
const AREA = { portrait: { w: 672, h: 941 }, landscape: { w: 1016, h: 650 } } as const;
/** Largest height (CSS px) of a figure placed in the text flow, leaving room for its heading and a short description. */
const INLINE_MAX_HEIGHT = 760;
type Orientation = keyof typeof AREA;

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
@page landscape { size: A4 landscape; margin: 12mm 14mm; }
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
.uml-page { break-before: page; break-after: page; }
.uml-page.landscape { page: landscape; }
.uml-page figure { margin: 0; }
figure.uml img, figure.uml svg { max-width: none; max-height: none; display: block; margin: 0 auto; }
.uml-note { font-size: 8.5pt; color: #6b7280; }
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
let exportProblems: ExportProblem[] = [];

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const px = (n: number) => `${Math.floor(n)}px`;
const percent = (scale: number) => `${Math.round(scale * 100)} %`;

/** Detail tiles of a diagram for one page orientation, printed at MIN_SCALE or more. */
function tilesFor(width: number, height: number, orientation: Orientation) {
  const area = AREA[orientation];
  const span = (size: number, room: number) => Math.max(1, Math.ceil((size - OVERLAP) / (room / MIN_SCALE - OVERLAP)));
  const cols = span(width, area.w);
  const rows = span(height, area.h);
  const tileW = (width + (cols - 1) * OVERLAP) / cols;
  const tileH = (height + (rows - 1) * OVERLAP) / rows;
  const scale = Math.min(1, area.w / tileW, area.h / tileH);
  const tiles: Array<{ x: number; y: number; row: number; col: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) tiles.push({ x: c * (tileW - OVERLAP), y: r * (tileH - OVERLAP), row: r + 1, col: c + 1 });
  }
  return { orientation, cols, rows, tileW, tileH, scale, tiles };
}

/** One rendered diagram as print-ready HTML (see the comment at the top of this file). */
function diagramHtml(name: string, caption: string, intro: { heading: boolean; chars: number }): string {
  const svgFile = join(UML_OUT, `${name}.svg`);
  const text = readFileSync(svgFile, 'utf8');
  const { width, height } = svgSize(text);
  const label = escapeHtml(caption);
  const headingRoom = (o: Orientation) => (intro.heading ? HEADING_ROOM + Math.ceil(intro.chars / CHARS_PER_LINE[o]) * INTRO_LINE : 0);
  const fit = (o: Orientation, maxHeight: number = AREA[o].h - headingRoom(o)) => Math.min(1, AREA[o].w / width, maxHeight / height);
  const overviewFit = (o: Orientation) => fit(o, AREA[o].h - headingRoom(o) - OVERVIEW_CAPTION);
  const img = (scale: number) => `<img src="${pathToFileURL(svgFile).href}" alt="${label}" style="width:${px(width * scale)};height:${px(height * scale)}">`;
  const figure = (body: string, figcaption: string) => `<figure class="uml">${body}<figcaption>${figcaption}</figcaption></figure>`;
  const page = (o: Orientation, body: string) => `<section class="uml-page ${o}">${body}</section>`;

  if (fit('portrait', INLINE_MAX_HEIGHT) >= MIN_SCALE) return figure(img(fit('portrait', INLINE_MAX_HEIGHT)), label);
  if (fit('landscape') >= MIN_SCALE) return page('landscape', figure(img(fit('landscape')), label));

  const detail = (['landscape', 'portrait'] as const).map((o) => tilesFor(width, height, o))
    .sort((a, b) => a.tiles.length - b.tiles.length || b.scale - a.scale)[0];
  if (detail.tiles.length === 1 && !intro.heading) return page(detail.orientation, figure(img(detail.scale), label));
  const overview: Orientation = overviewFit('landscape') >= overviewFit('portrait') ? 'landscape' : 'portrait';
  const start = text.indexOf('>', text.search(/<svg\b/)) + 1;
  const inner = text.slice(start, text.lastIndexOf('</svg>')).replace(/<\?[\s\S]*?\?>/g, '').replace(/\r?\n/g, ' ');
  const pages = [page(overview, figure(img(overviewFit(overview)),
    `${label} — overview at ${percent(overviewFit(overview))} <span class="uml-note">(read the ${detail.tiles.length} detail pages that follow, at ${percent(detail.scale)}; on screen, zoom in)</span>`))];
  detail.tiles.forEach((tile, i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${tile.x} ${tile.y} ${detail.tileW} ${detail.tileH}" style="width:${px(detail.tileW * detail.scale)};height:${px(detail.tileH * detail.scale)}" preserveAspectRatio="xMinYMin meet">${inner}</svg>`;
    const where = [detail.rows > 1 ? `row ${tile.row} of ${detail.rows}` : '', detail.cols > 1 ? `column ${tile.col} of ${detail.cols}` : ''].filter(Boolean).join(', ');
    pages.push(page(detail.orientation, figure(svg, `${label} — detail ${i + 1} of ${detail.tiles.length} (${where}), at ${percent(detail.scale)}`)));
  });
  return pages.join('');
}

/** Replaces Markdown image references to rendered diagrams with figures (or placeholders). */
function embedDiagrams(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(uml\/out\/([\w.-]+)\.(svg|png)\)/g, (_m, caption: string, name: string, _ext: string, offset: number) => {
    const problems = exportProblems.filter((p) => p.diagram === name);
    // The same rule as the heading move in the page assembly below: a heading, optionally followed by one short paragraph.
    const before = /(?:^|\n)#{1,4} [^\n]*\n\s*(?:([^\n#!|<][^\n]{0,600})\n\s*)?$/.exec(markdown.slice(0, offset));
    const intro = { heading: Boolean(before), chars: before?.[1]?.length ?? 0 };
    if (!problems.length) return `\n\n${diagramHtml(name, caption, intro)}\n\n`;
    missingDiagrams.add(name);
    const why = problems.map((p) => `${p.file}: ${p.kind} — ${escapeHtml(p.detail)}`).join('<br>');
    return `<figure><div class="placeholder">DIAGRAM NOT USABLE: ${escapeHtml(caption)}<br><small>${why}<br>Source: docs/uml/${name}.puml — run "npm run uml", then rebuild.</small></div><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
  });
}

function findBrowser(): string | null {
  return BROWSERS.find((p) => existsSync(p)) ?? null;
}

mkdirSync(BUILD, { recursive: true });
const browser = findBrowser();
if (!browser) console.warn('No Edge/Chrome found: HTML is built, PDFs are skipped. Set EDGE_PATH.');

exportProblems = checkExports(join(DOCS, 'uml'), UML_OUT);
for (const spec of SPECS) {
  missingDiagrams = new Set();
  const parts = spec.sources.map((file, i) => {
    const markdown = embedDiagrams(readFileSync(join(DOCS, file), 'utf8'));
    const html = marked.parse(markdown, { async: false }) as string;
    return i === 0 ? html : `<div class="page-break"></div>${html}`;
  });
  // A heading (and at most one short introductory paragraph) moves onto the first page of the figure that follows it.
  const body = parts.join('\n').replace(/(<h[1-4][^>]*>(?:(?!<\/h[1-4]>)[\s\S])*<\/h[1-4]>\s*(?:<p>(?:(?!<\/p>)[\s\S]){0,600}<\/p>\s*)?)(<section class="uml-page [a-z]+">)/g, '$2$1');
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${spec.title}</title><style>${CSS}</style></head><body>${body}</body></html>`;
  const htmlFile = join(BUILD, `${spec.output}.html`);
  writeFileSync(htmlFile, page);
  if (browser) {
    const pdfFile = join(BUILD, `${spec.output}.pdf`);
    const result = spawnSync(browser, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfFile}`, pathToFileURL(htmlFile).href], { stdio: 'pipe', timeout: 120_000 });
    if (result.status !== 0 || !existsSync(pdfFile)) console.error(`PDF generation failed for ${spec.output}: ${result.stderr?.toString() ?? ''}`);
    else console.log(`✔ ${pdfFile}`);
  }
  if (missingDiagrams.size) console.warn(`  ⚠ ${spec.output}: ${missingDiagrams.size} diagram(s) replaced by placeholders: their exports fail npm run uml:check (${[...missingDiagrams].join(', ')})`);
}
