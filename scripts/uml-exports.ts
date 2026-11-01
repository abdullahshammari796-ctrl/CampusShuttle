// Validation of rendered UML exports (docs/uml/out/*.svg|png) shared by the
// renderer (scripts/render-uml.ts), the stand-alone check (scripts/check-uml.ts)
// and the PDF build (scripts/build-docs.ts).
//
// A file existing is not evidence of a successful render. Every export is
// decoded, its size compared with its sibling (PlantUML clips PNGs at
// PLANTUML_LIMIT_SIZE but not SVGs), and docs/uml/out/manifest.json ties each
// export to the SHA-256 of the source it was rendered from, so an export that is
// older than its source, or was replaced after rendering, is reported as stale.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { crc32, inflateSync } from 'node:zlib';

export interface ImageSize { width: number; height: number }

export type ProblemKind = 'missing' | 'empty' | 'corrupt' | 'truncated' | 'stale' | 'unrecorded' | 'orphan';
export interface ExportProblem { diagram: string; file: string; kind: ProblemKind; detail: string }

export interface ExportRecord { sha256: string; width: number; height: number }
export interface DiagramRecord { source: string; sourceSha256: string; svg: ExportRecord; png: ExportRecord }
export interface UmlManifest {
  generator: string;
  renderedAt: string;
  renderer: { plantumlJar: string; jarSha256: string; java: string; limitSize: number };
  diagrams: Record<string, DiagramRecord>;
}

export const MANIFEST_FILE = 'manifest.json';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** PlantUML draws an error image instead of failing when -failfast2 is not used. */
const PLANTUML_ERROR = /Syntax Error\?|An error has occured|Diagram too large/i;

export const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

/** Source hash independent of the checkout's line endings (CRLF on Windows, LF in Git and CI). */
export const sourceSha256 = (text: string): string => sha256(text.replace(/\r\n/g, '\n'));

/** Decodes a PNG far enough to prove it is complete: chunk CRCs, IHDR, IEND and the full pixel data. */
export function pngSize(buf: Buffer): ImageSize {
  if (buf.length === 0) throw new Error('empty file');
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG (bad signature)');
  let pos = 8;
  let size: ImageSize | null = null;
  let rowBytes = 0;
  let interlaced = false;
  const idat: Buffer[] = [];
  let ended = false;
  while (pos < buf.length) {
    if (pos + 12 > buf.length) throw new Error(`truncated chunk header at byte ${pos}`);
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (pos + 12 + length > buf.length) throw new Error(`truncated ${type} chunk at byte ${pos}`);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (crc32(buf.subarray(pos + 4, pos + 8 + length)) !== buf.readUInt32BE(pos + 8 + length)) throw new Error(`CRC mismatch in ${type} chunk`);
    if (!size && type !== 'IHDR') throw new Error('first chunk is not IHDR');
    if (type === 'IHDR') {
      size = { width: data.readUInt32BE(0), height: data.readUInt32BE(4) };
      const bitDepth = data[8];
      const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[data[9]];
      if (!channels || !size.width || !size.height) throw new Error('invalid IHDR');
      rowBytes = 1 + Math.ceil((size.width * channels * bitDepth) / 8);
      interlaced = data[12] === 1;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      ended = true;
      break;
    }
    pos += 12 + length;
  }
  if (!size) throw new Error('no IHDR chunk');
  if (!ended) throw new Error('no IEND chunk (file truncated)');
  if (!idat.length) throw new Error('no image data');
  let pixels: Buffer;
  try {
    pixels = inflateSync(Buffer.concat(idat));
  } catch {
    throw new Error('image data does not decompress');
  }
  if (!interlaced && pixels.length < rowBytes * size.height) throw new Error(`image data incomplete (${pixels.length} of ${rowBytes * size.height} bytes)`);
  return size;
}

/** Checks that an SVG is complete, is not a PlantUML error image, and returns its size. */
export function svgSize(text: string): ImageSize {
  if (!text.trim()) throw new Error('empty file');
  const root = /<svg\b[^>]*>/.exec(text);
  if (!root) throw new Error('no <svg> root element');
  if (!text.trimEnd().endsWith('</svg>')) throw new Error('no closing </svg> (file truncated)');
  if (PLANTUML_ERROR.test(text)) throw new Error('PlantUML drew an error image');
  const attr = (name: string) => new RegExp(`\\b${name}="([\\d.]+)(?:px)?"`).exec(root[0])?.[1];
  const viewBox = /\bviewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(root[0]);
  const width = Number(attr('width') ?? viewBox?.[1]);
  const height = Number(attr('height') ?? viewBox?.[2]);
  if (!(width > 0 && height > 0)) throw new Error('no usable width/height');
  return { width, height };
}

/** Validates the SVG and PNG of one diagram in `dir` without a manifest: presence, decoding and clipping. */
export function inspectDiagram(dir: string, name: string): { problems: ExportProblem[]; svg?: ImageSize; png?: ImageSize } {
  const problems: ExportProblem[] = [];
  const sizes: { svg?: ImageSize; png?: ImageSize } = {};
  for (const ext of ['svg', 'png'] as const) {
    const file = `${name}.${ext}`;
    const path = join(dir, file);
    if (!existsSync(path)) {
      problems.push({ diagram: name, file, kind: 'missing', detail: 'not rendered' });
      continue;
    }
    const data = readFileSync(path);
    try {
      sizes[ext] = ext === 'svg' ? svgSize(data.toString('utf8')) : pngSize(data);
    } catch (e) {
      const detail = (e as Error).message;
      problems.push({ diagram: name, file, kind: detail === 'empty file' ? 'empty' : 'corrupt', detail });
    }
  }
  if (sizes.svg && sizes.png) {
    const dw = Math.abs(sizes.svg.width - sizes.png.width);
    const dh = Math.abs(sizes.svg.height - sizes.png.height);
    if (dw > 1 || dh > 1) {
      problems.push({
        diagram: name, file: `${name}.png`, kind: 'truncated',
        detail: `PNG ${sizes.png.width}×${sizes.png.height} differs from SVG ${Math.round(sizes.svg.width)}×${Math.round(sizes.svg.height)} (clipped by PLANTUML_LIMIT_SIZE?)`,
      });
    }
  }
  return { problems, ...sizes };
}

export function readManifest(outDir: string): UmlManifest | null {
  const path = join(outDir, MANIFEST_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as UmlManifest;
}

/**
 * Checks every source in `umlDir` against its exports in `outDir` and the
 * manifest written by the renderer. Returns no problems only when each export
 * decodes, is not clipped, and was rendered from the current source.
 */
export function checkExports(umlDir: string, outDir: string, manifest: UmlManifest | null = readManifest(outDir)): ExportProblem[] {
  const names = readdirSync(umlDir).filter((f) => f.endsWith('.puml')).map((f) => basename(f, '.puml')).sort();
  const problems: ExportProblem[] = [];
  for (const name of names) {
    const inspected = inspectDiagram(outDir, name);
    problems.push(...inspected.problems);
    if (inspected.problems.length) continue;
    const record = manifest?.diagrams[name];
    if (!record) {
      problems.push({ diagram: name, file: MANIFEST_FILE, kind: 'unrecorded', detail: 'exports are not recorded in the render manifest; render them with npm run uml' });
      continue;
    }
    if (sourceSha256(readFileSync(join(umlDir, `${name}.puml`), 'utf8')) !== record.sourceSha256) {
      problems.push({ diagram: name, file: `${name}.puml`, kind: 'stale', detail: 'the source changed after these exports were rendered' });
    }
    for (const ext of ['svg', 'png'] as const) {
      if (sha256(readFileSync(join(outDir, `${name}.${ext}`))) !== record[ext].sha256) {
        problems.push({ diagram: name, file: `${name}.${ext}`, kind: 'stale', detail: 'the file differs from the one the renderer recorded' });
      }
    }
  }
  if (existsSync(outDir)) {
    for (const file of readdirSync(outDir).filter((f) => /\.(svg|png)$/.test(f))) {
      const name = file.replace(/\.(svg|png)$/, '');
      if (!names.includes(name)) problems.push({ diagram: name, file, kind: 'orphan', detail: 'no matching .puml source' });
    }
  }
  return problems;
}

/** Builds the manifest record for one validated diagram. */
export function recordDiagram(umlDir: string, outDir: string, name: string, sizes: { svg: ImageSize; png: ImageSize }): DiagramRecord {
  const file = (ext: string) => readFileSync(join(outDir, `${name}.${ext}`));
  return {
    source: `docs/uml/${name}.puml`,
    sourceSha256: sourceSha256(readFileSync(join(umlDir, `${name}.puml`), 'utf8')),
    svg: { sha256: sha256(file('svg')), width: Math.round(sizes.svg.width), height: Math.round(sizes.svg.height) },
    png: { sha256: sha256(file('png')), width: sizes.png.width, height: sizes.png.height },
  };
}
