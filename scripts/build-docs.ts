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
// size. In the separate UML-set PDF, which the brief asks for "at full readable
// size", each diagram is also scaled so that its smallest text prints at
// UML_SET_MIN_TEXT_PT or more. One that fits a portrait or landscape A4 page at
// that scale gets one figure; a larger one gets a vector overview page (zoomable
// on screen) followed by detail pages printed at that scale or more. Detail pages
// overlap at their edges; where that still leaves the text too small, the diagram
// is instead split only through empty space, so that no box or label is cut, and
// the overview outlines and numbers each detail.
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
/**
 * Smallest printed text size (pt) in the separate UML-set PDF. At MIN_SCALE alone, 11–12 px annotations printed
 * at 5.5–5.6 pt (A.5, A.9, A.15). One CSS px prints as 0.75 pt.
 */
const UML_SET_MIN_TEXT_PT = 7;
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
  /** Smallest printed text size (pt) of the diagrams; without it, diagrams only respect MIN_SCALE. */
  minTextPt?: number;
}

const SPECS: DocSpec[] = [
  { output: 'proposal', title: 'Project proposal', sources: ['01-proposal.md'] },
  { output: 'project-report', title: 'Project report', sources: ['02-project-report.md', '03-uml-diagram-set.md'] },
  { output: 'uml-diagram-set', title: 'UML diagram set', sources: ['03-uml-diagram-set.md'], minTextPt: UML_SET_MIN_TEXT_PT },
];

let missingDiagrams = new Set<string>();
let minTextPt: number | undefined;
let exportProblems: ExportProblem[] = [];

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const px = (n: number) => `${Math.floor(n)}px`;
const percent = (scale: number) => `${Math.round(scale * 100)} %`;

/** Smallest print scale of one diagram in the document being built: MIN_SCALE, raised so its smallest text reaches minTextPt. */
function minScaleOf(svgText: string): number {
  const sizes = [...svgText.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
  if (!minTextPt || !sizes.length) return MIN_SCALE;
  // A little above the exact scale, so that rounding page sizes down to whole pixels cannot drop below minTextPt.
  return Math.min(1, Math.max(MIN_SCALE, minTextPt / (0.75 * Math.min(...sizes)) + 0.002));
}

/**
 * Detail tiles of a diagram for one page orientation, aiming at the target scale. With maxRows, the diagram is never
 * cut horizontally into more rows than that: a shorter page then lowers the scale, and only columns are added.
 */
function tilesFor(width: number, height: number, orientation: Orientation, target: number, maxRows = Infinity) {
  const area = AREA[orientation];
  const span = (size: number, room: number, scale: number) => Math.max(1, Math.ceil((size - OVERLAP) / (room / scale - OVERLAP)));
  const rows = Math.min(span(height, area.h, target), maxRows);
  const tileH = (height + (rows - 1) * OVERLAP) / rows;
  const cols = span(width, area.w, Math.min(target, area.h / tileH));
  const tileW = (width + (cols - 1) * OVERLAP) / cols;
  const scale = Math.min(1, area.w / tileW, area.h / tileH);
  const tiles: Tile[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) tiles.push({ x: c * (tileW - OVERLAP), y: r * (tileH - OVERLAP), w: tileW, h: tileH, row: r + 1, col: c + 1 });
  }
  return { orientation, cols, rows, scale, tiles, coherent: false };
}

interface Box { x0: number; y0: number; x1: number; y1: number }
interface Tile { x: number; y: number; w: number; h: number; row: number; col: number; scale?: number }

/** End points of an SVG path's absolute commands (PlantUML writes absolute M, L, C, Q and A commands). */
function pathPoints(d: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (const [, cmd, args] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    const n = (args.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    if (cmd === 'A') for (let i = 0; i + 6 < n.length; i += 7) points.push([n[i + 5], n[i + 6]]);
    else if ('MLCQST'.includes(cmd)) for (let i = 0; i + 1 < n.length; i += 2) points.push([n[i], n[i + 1]]);
  }
  return points;
}

/**
 * What a page break must not cut through, each with a small margin: every text line, every small rectangle or
 * ellipse (class, participant, action or use case) and every entity group (class, note, state). Package frames,
 * swimlanes and combined fragments are large and may be cut, like the lines that connect the boxes.
 */
function obstacles(svgText: string, width: number, height: number): Box[] {
  const num = (attrs: string, name: string) => Number(new RegExp(`\\b${name}="([-\\d.]+)"`).exec(attrs)?.[1] ?? NaN);
  const M = 3;
  const small = (w: number, h: number) => w > 0 && h > 0 && w < 0.6 * width && h < 0.3 * height;
  const textBoxes = (svg: string) => [...svg.matchAll(/<text\b([^>]*)>/g)].map(([, a]): Box => {
    const x = num(a, 'x'), y = num(a, 'y'), size = num(a, 'font-size') || 12;
    return { x0: x, y0: y - size, x1: x + (num(a, 'textLength') || 0), y1: y + size * 0.35 };
  });
  const shapeBoxes = (svg: string) => [
    ...[...svg.matchAll(/<rect\b([^>]*)>/g)].map(([, a]): Box => {
      const x = num(a, 'x') || 0, y = num(a, 'y') || 0;
      return { x0: x, y0: y, x1: x + num(a, 'width'), y1: y + num(a, 'height') };
    }),
    ...[...svg.matchAll(/<ellipse\b([^>]*)>/g)].map(([, a]): Box => {
      const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((n) => num(a, n));
      return { x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry };
    }),
  ];
  const finite = (b: Box) => [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite);
  const grow = (b: Box, by: number): Box => ({ x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by });
  const union = (list: Box[]): Box => ({
    x0: Math.min(...list.map((b) => b.x0)), y0: Math.min(...list.map((b) => b.y0)),
    x1: Math.max(...list.map((b) => b.x1)), y1: Math.max(...list.map((b) => b.y1)),
  });
  const boxes: Box[] = [
    ...textBoxes(svgText),
    ...shapeBoxes(svgText).filter((b) => small(b.x1 - b.x0, b.y1 - b.y0)),
  ];
  for (const [, body] of svgText.matchAll(/<g class="entity"[^>]*>([\s\S]*?)<\/g>/g)) {
    // An entity's own box and text; outline points far beyond them belong to a note's pointer line, which may be cut.
    const core = [...textBoxes(body), ...shapeBoxes(body)].filter(finite);
    const points = [...body.matchAll(/\sd="([^"]*)"/g)].flatMap(([, d]) => pathPoints(d))
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    const near = core.length ? grow(union(core), 40) : null;
    const outline = points.filter(([x, y]) => !near || (x >= near.x0 && x <= near.x1 && y >= near.y0 && y <= near.y1))
      .map(([x, y]): Box => ({ x0: x, y0: y, x1: x, y1: y }));
    if (core.length || outline.length) boxes.push(union([...core, ...outline]));
  }
  return boxes.filter(finite).map((b) => grow(b, M));
}

const boundsOf = (boxes: Box[], width: number, height: number): Box => ({
  x0: Math.max(0, Math.min(...boxes.map((b) => b.x0))), y0: Math.max(0, Math.min(...boxes.map((b) => b.y0))),
  x1: Math.min(width, Math.max(...boxes.map((b) => b.x1))), y1: Math.min(height, Math.max(...boxes.map((b) => b.y1))),
});

/** Middles of the empty stretches between the boxes along one axis (not at the outer edges). */
function gapMiddles(boxes: Box[], axis: 'x' | 'y'): number[] {
  const spans = boxes.map((b) => (axis === 'x' ? [b.x0, b.x1] : [b.y0, b.y1])).sort((p, q) => p[0] - q[0]);
  const middles: number[] = [];
  let covered = spans[0][1];
  for (const [a, b] of spans.slice(1)) {
    if (a > covered) middles.push((covered + a) / 2);
    covered = Math.max(covered, b);
  }
  return middles;
}

/** The boxes that no other box contains (a class, not each of its text lines); of identical boxes, the first. */
function outermost(boxes: Box[]): Box[] {
  const contains = (o: Box, b: Box) => o.x0 <= b.x0 && o.y0 <= b.y0 && o.x1 >= b.x1 && o.y1 >= b.y1;
  return boxes.filter((b, i) => !boxes.some((o, j) => j !== i && contains(o, b) && (!contains(b, o) || j < i)));
}

/**
 * Page-sized windows, in reading order, such that every box lies wholly inside at least one of them; null if a box
 * is larger than a page. Windows may overlap, so a box cut by a window's edge is shown faded there (see diagramHtml).
 */
function coverTiles(boxes: Box[], roomW: number, roomH: number, scale: number, width: number, height: number): Tile[] | null {
  const units = outermost(boxes);
  if (units.some((b) => b.x1 - b.x0 > roomW + 1e-6 || b.y1 - b.y0 > roomH + 1e-6)) return null;
  const tiles: Tile[] = [];
  let left = units;
  while (left.length) {
    const top = Math.min(...left.map((b) => b.y0));
    let strip = left.filter((b) => b.y1 <= top + roomH + 1e-6);
    while (strip.length) {
      const from = Math.min(...strip.map((b) => b.x0));
      const window = strip.filter((b) => b.x1 <= from + roomW + 1e-6);
      const r = boundsOf(window, width, height);
      tiles.push({ x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, row: 0, col: 0, scale });
      strip = strip.filter((b) => b.x1 > from + roomW + 1e-6);
    }
    left = left.filter((b) => b.y1 > top + roomH + 1e-6);
  }
  return tiles;
}

/**
 * Coherent detail views of one diagram for one page orientation at `scale`. The diagram is split recursively, each
 * time along an empty line (horizontal or vertical) that no label, box or class crosses, until every part fits a
 * page; empty space is left out. Each split keeps the fewest pages of three promising candidates, then the most
 * even parts. A part without such a line is covered by overlapping windows that each show whole boxes (counted as
 * 1.5 pages each, so that clean splits win); failing that, it is printed smaller on a page of its own, and if that
 * would fall below MIN_SCALE there is no coherent layout (null). Parts come in reading order.
 */
function coherentTilesFor(svgText: string, width: number, height: number, orientation: Orientation, scale: number) {
  const area = AREA[orientation];
  const [roomW, roomH] = [area.w / scale, area.h / scale];
  const pagesOf = (b: Box) => Math.ceil((b.x1 - b.x0) / roomW - 1e-9) * Math.ceil((b.y1 - b.y0) / roomH - 1e-9);
  type Plan = { tiles: Tile[]; cost: number };
  const memo = new Map<string, Plan>();
  const plan = (boxes: Box[], depth: number): Plan => {
    const key = boxes.map((o) => ids.get(o)).join(',');
    if (!memo.has(key)) memo.set(key, planFresh(boxes, depth));
    return memo.get(key)!;
  };
  const planFresh = (boxes: Box[], depth: number): Plan => {
    const b = boundsOf(boxes, width, height);
    const [w, h] = [b.x1 - b.x0, b.y1 - b.y0];
    if (w <= roomW + 1e-6 && h <= roomH + 1e-6) return { tiles: [{ x: b.x0, y: b.y0, w, h, row: 0, col: 0, scale }], cost: 1 };
    const cuts = (['x', 'y'] as const).flatMap((axis) => gapMiddles(boxes, axis).map((at) => {
      const first = boxes.filter((o) => (axis === 'x' ? o.x1 : o.y1) <= at);
      const second = boxes.filter((o) => (axis === 'x' ? o.x1 : o.y1) > at);
      const [p, q] = [boundsOf(first, width, height), boundsOf(second, width, height)];
      const size = (r: Box) => (axis === 'x' ? r.x1 - r.x0 : r.y1 - r.y0);
      return { first, second, estimate: pagesOf(p) + pagesOf(q), evenness: Math.min(size(p), size(q)) };
    })).sort((u, v) => u.estimate - v.estimate || v.evenness - u.evenness);
    const covered = coverTiles(boxes, roomW, roomH, scale, width, height);
    const fallback = Math.min(1, area.w / w, area.h / h);
    let best: Plan & { evenness: number } = covered
      ? { tiles: covered, cost: 1.5 * covered.length, evenness: 0 }
      : { tiles: [{ x: b.x0, y: b.y0, w, h, row: 0, col: 0, scale: fallback }], cost: fallback >= MIN_SCALE ? 100 : Infinity, evenness: 0 };
    if (depth > 12) return best;
    for (const cut of cuts.slice(0, depth < 3 ? 3 : 1)) {
      const [one, two] = [plan(cut.first, depth + 1), plan(cut.second, depth + 1)];
      const option = { tiles: [...one.tiles, ...two.tiles], cost: one.cost + two.cost, evenness: cut.evenness };
      if (option.cost < best.cost || (option.cost === best.cost && option.evenness > best.evenness)) best = option;
    }
    return best;
  };
  const boxes = obstacles(svgText, width, height);
  if (!boxes.length) return null;
  const ids = new Map(boxes.map((o, i) => [o, i]));
  const { tiles, cost } = plan(boxes, 0);
  if (!Number.isFinite(cost)) return null;
  return { orientation, rows: 0, cols: 0, scale: Math.min(...tiles.map((t) => t.scale ?? scale)), tiles, coherent: true };
}

/** Where a detail lies in the whole diagram, in words ("top left", "middle", "bottom right" …). */
function placeOf(tile: Tile, width: number, height: number): string {
  const third = (at: number, size: number) => Math.min(2, Math.floor((3 * at) / size));
  const v = ['top', 'middle', 'bottom'][third(tile.y + tile.h / 2, height)];
  const hz = ['left', 'centre', 'right'][third(tile.x + tile.w / 2, width)];
  if (v === 'middle' && hz === 'centre') return 'centre';
  return v === 'middle' ? hz : hz === 'centre' ? v : `${v} ${hz}`;
}

/** One rendered diagram as print-ready HTML (see the comment at the top of this file). */
function diagramHtml(name: string, caption: string, intro: { heading: boolean; chars: number }): string {
  const svgFile = join(UML_OUT, `${name}.svg`);
  const text = readFileSync(svgFile, 'utf8');
  const { width, height } = svgSize(text);
  const target = minScaleOf(text);
  const label = escapeHtml(caption);
  const headingRoom = (o: Orientation) => (intro.heading ? HEADING_ROOM + Math.ceil(intro.chars / CHARS_PER_LINE[o]) * INTRO_LINE : 0);
  const fit = (o: Orientation, maxHeight: number = AREA[o].h - headingRoom(o)) => Math.min(1, AREA[o].w / width, maxHeight / height);
  const overviewFit = (o: Orientation) => fit(o, AREA[o].h - headingRoom(o) - OVERVIEW_CAPTION);
  const img = (scale: number) => `<img src="${pathToFileURL(svgFile).href}" alt="${label}" style="width:${px(width * scale)};height:${px(height * scale)}">`;
  const figure = (body: string, figcaption: string) => `<figure class="uml">${body}<figcaption>${figcaption}</figcaption></figure>`;
  const page = (o: Orientation, body: string) => `<section class="uml-page ${o}">${body}</section>`;

  if (fit('portrait', INLINE_MAX_HEIGHT) >= target) return figure(img(fit('portrait', INLINE_MAX_HEIGHT)), label);
  if (fit('landscape') >= target) return page('landscape', figure(img(fit('landscape')), label));

  interface Layout { orientation: Orientation; rows: number; cols: number; scale: number; tiles: Tile[]; coherent: boolean }
  const best = (layouts: Array<Layout | null>) => layouts.filter((l): l is Layout => l !== null && l.scale >= MIN_SCALE - 1e-9)
    .sort((a, b) => a.tiles.length - b.tiles.length || b.scale - a.scale)[0];
  const orientations = ['landscape', 'portrait'] as const;
  // A higher target must not cut the diagram horizontally more often than the MIN_SCALE layout does: a class box
  // split across two rows of pages is harder to read than smaller text.
  const fitsOnePage = fit('portrait', INLINE_MAX_HEIGHT) >= MIN_SCALE || fit('landscape') >= MIN_SCALE;
  const baseRows = fitsOnePage ? 1 : best(orientations.map((o) => tilesFor(width, height, o, MIN_SCALE))).rows;
  let detail: Layout = best(orientations.map((o) => tilesFor(width, height, o, target, baseRows)))
    ?? best(orientations.map((o) => tilesFor(width, height, o, MIN_SCALE)));
  // Still short of the target: split only through empty space instead, so that no box or label is cut.
  if (minTextPt && detail.scale < target - 1e-9) {
    detail = best(orientations.map((o) => coherentTilesFor(text, width, height, o, target))) ?? detail;
  }
  if (detail.tiles.length === 1 && !intro.heading) return page(detail.orientation, figure(img(detail.scale), label));
  // An overview page is only worth it when the full page that follows is clearly larger than one page with the
  // heading, or when only the full page reaches the smallest text size.
  const onePage = Math.max(fit('portrait', INLINE_MAX_HEIGHT), fit('portrait'), fit('landscape'));
  const onePageReadable = !minTextPt || onePage >= target - 1e-9;
  if (detail.tiles.length === 1 && fitsOnePage && detail.scale < 1.15 * onePage && onePageReadable) {
    if (fit('portrait', INLINE_MAX_HEIGHT) >= onePage) return figure(img(fit('portrait', INLINE_MAX_HEIGHT)), label);
    const o: Orientation = fit('portrait') >= fit('landscape') ? 'portrait' : 'landscape';
    return page(o, figure(img(fit(o)), label));
  }
  const overview: Orientation = overviewFit('landscape') >= overviewFit('portrait') ? 'landscape' : 'portrait';
  const ov = overviewFit(overview);
  const start = text.indexOf('>', text.search(/<svg\b/)) + 1;
  const inner = text.slice(start, text.lastIndexOf('</svg>')).replace(/<\?[\s\S]*?\?>/g, '').replace(/\r?\n/g, ' ');
  const single = detail.tiles.length === 1;
  const scaleOf = (tile: Tile) => tile.scale ?? detail.scale;
  const [low, high] = [Math.min(...detail.tiles.map(scaleOf)), Math.max(...detail.tiles.map(scaleOf))];
  const at = low === high ? percent(low) : `${percent(low)} to ${percent(high)}`;
  const numbered = detail.coherent && !single;
  const guide = single ? `the next page prints it at ${at}`
    : numbered ? `the ${detail.tiles.length} numbered detail pages that follow print it at ${at}; each box and label is whole on one of them, and faded where a page edge cuts it`
      : `read the ${detail.tiles.length} detail pages that follow, at ${at}`;
  // On the overview, each coherent detail is outlined and numbered, so a reader can see where it belongs.
  const outline = !numbered ? '' : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="position:absolute;left:0;top:0;width:${px(width * ov)};height:${px(height * ov)}">${
    detail.tiles.map((t, i) => {
      const r = 9 / ov;
      return `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="none" stroke="#d97706" stroke-width="${1.5 / ov}" stroke-dasharray="${6 / ov} ${4 / ov}"/>`
        + `<circle cx="${t.x + r}" cy="${t.y + r}" r="${r}" fill="#d97706"/>`
        + `<text x="${t.x + r}" y="${t.y + r * 1.38}" font-size="${11 / ov}" font-family="Arial" font-weight="700" fill="#ffffff" text-anchor="middle">${i + 1}</text>`;
    }).join('')}</svg>`;
  const overviewBody = numbered
    ? `<div style="position:relative;width:${px(width * ov)};height:${px(height * ov)};margin:0 auto">${img(ov)}${outline}</div>`
    : img(ov);
  const pages = [page(overview, figure(overviewBody,
    `${label} — overview at ${percent(ov)} <span class="uml-note">(${guide}; on screen, zoom in)</span>`))];
  // A box that a coherent detail shows only in part is faded there; it appears whole on another detail page.
  const units = detail.coherent ? outermost(obstacles(text, width, height)) : [];
  detail.tiles.forEach((tile, i) => {
    const s = scaleOf(tile);
    const [x1, y1] = [tile.x + tile.w, tile.y + tile.h];
    const fades = units.filter((b) => b.x1 > tile.x && b.x0 < x1 && b.y1 > tile.y && b.y0 < y1)
      .filter((b) => b.x0 < tile.x - 1 || b.y0 < tile.y - 1 || b.x1 > x1 + 1 || b.y1 > y1 + 1)
      .map((b) => `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="#ffffff" fill-opacity="0.85"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${tile.x} ${tile.y} ${tile.w} ${tile.h}" style="width:${px(tile.w * s)};height:${px(tile.h * s)}" preserveAspectRatio="xMinYMin meet">${inner}${fades}</svg>`;
    const where = detail.coherent ? placeOf(tile, width, height)
      : [detail.rows > 1 ? `row ${tile.row} of ${detail.rows}` : '', detail.cols > 1 ? `column ${tile.col} of ${detail.cols}` : ''].filter(Boolean).join(', ');
    const what = single ? 'full page' : `detail ${i + 1} of ${detail.tiles.length} (${where})`;
    pages.push(page(detail.orientation, figure(svg, `${label} — ${what}, at ${percent(s)}`)));
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
  minTextPt = spec.minTextPt;
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
