// Validation of rendered UML exports (docs/uml/out/*.svg|png) shared by the
// renderer (scripts/render-uml.ts), the stand-alone check (scripts/check-uml.ts)
// and the PDF build (scripts/build-docs.ts).
//
// A file existing is not evidence of a successful render. Every SVG is parsed
// as XML and every PNG is decoded completely, each pair's sizes are compared
// (PlantUML clips PNGs at PLANTUML_LIMIT_SIZE but not SVGs), and
// docs/uml/out/manifest.json ties each export to the SHA-256 of the source it was
// rendered from, so an export that is older than its source, or was replaced
// after rendering, is reported as stale. A hash only records bytes, so exports
// are validated before they are recorded and again every time they are checked.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { crc32, inflateSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';

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

/** Channels per pixel for each PNG colour type (greyscale, RGB, palette, greyscale + alpha, RGBA). */
const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Decodes a PNG completely, or throws. Accepts exactly the subset PlantUML
 * writes (8 bits per channel, not interlaced) and rejects every other encoding
 * rather than skipping it: valid chunk structure and order with correct CRCs,
 * the zlib stream inflates to exactly one filter byte plus one row of pixels
 * per scanline, every filter type is 0–4, and after reconstructing each
 * scanline every palette index refers to an existing PLTE entry.
 */
export function pngSize(buf: Buffer): ImageSize {
  if (buf.length === 0) throw new Error('empty file');
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG (bad signature)');
  let header: { width: number; height: number; colourType: number; channels: number } | null = null;
  let paletteEntries = 0;
  const idat: Buffer[] = [];
  let idatEnded = false;
  let ended = false;
  let pos = 8;
  while (pos < buf.length) {
    if (pos + 12 > buf.length) throw new Error(`truncated chunk header at byte ${pos}`);
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`invalid chunk type at byte ${pos}`);
    if (length > 0x7fffffff || pos + 12 + length > buf.length) throw new Error(`truncated ${type} chunk at byte ${pos}`);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (crc32(buf.subarray(pos + 4, pos + 8 + length)) !== buf.readUInt32BE(pos + 8 + length)) throw new Error(`CRC mismatch in ${type} chunk`);
    pos += 12 + length;

    if (!header) {
      if (type !== 'IHDR' || length !== 13) throw new Error('first chunk is not a valid IHDR');
      const [bitDepth, colourType, compression, filter, interlace] = data.subarray(8, 13);
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      const channels = PNG_CHANNELS[colourType];
      if (!width || !height || !channels || compression !== 0 || filter !== 0) throw new Error('invalid IHDR');
      if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG encoding (bit depth ${bitDepth}, interlace ${interlace}): only 8-bit, non-interlaced images as written by PlantUML are accepted`);
      header = { width, height, colourType, channels };
      continue;
    }
    if (type === 'IDAT') {
      if (idatEnded) throw new Error('IDAT chunks are not consecutive');
      if (header.colourType === 3 && !paletteEntries) throw new Error('palette image without a PLTE chunk before its data');
      idat.push(data);
      continue;
    }
    if (idat.length) idatEnded = true;
    if (type === 'IEND') {
      if (length !== 0) throw new Error('invalid IEND chunk');
      ended = true;
      break;
    }
    if (type === 'IHDR') throw new Error('second IHDR chunk');
    if (type === 'PLTE') {
      if (idat.length || paletteEntries || header.colourType === 0 || header.colourType === 4) throw new Error('misplaced PLTE chunk');
      if (length === 0 || length % 3 !== 0 || length > 768) throw new Error('invalid PLTE chunk');
      paletteEntries = length / 3;
    } else if (type === 'tRNS' && header.colourType === 3 && length > paletteEntries) {
      throw new Error('tRNS chunk longer than the palette');
    } else if (type.charCodeAt(0) < 0x61) {
      throw new Error(`unknown critical chunk ${type}`); // an upper-case first letter marks a chunk a decoder must understand
    }
  }
  if (!header) throw new Error('no IHDR chunk');
  if (!ended) throw new Error('no IEND chunk (file truncated)');
  if (pos !== buf.length) throw new Error(`${buf.length - pos} byte(s) after IEND`);
  if (!idat.length) throw new Error('no image data');
  let pixels: Buffer;
  try {
    pixels = inflateSync(Buffer.concat(idat));
  } catch {
    throw new Error('image data does not decompress');
  }
  const stride = header.width * header.channels; // bytes per scanline at 8 bits per channel
  if (pixels.length !== (stride + 1) * header.height) throw new Error(`image data has ${pixels.length} bytes, expected ${(stride + 1) * header.height}`);

  // Reconstruct every scanline (PNG specification §9) so that palette indices can be checked.
  const bpp = header.channels;
  let previous = Buffer.alloc(stride);
  let row = Buffer.alloc(stride);
  for (let y = 0; y < header.height; y++) {
    const start = y * (stride + 1);
    const filter = pixels[start];
    if (filter > 4) throw new Error(`invalid filter type ${filter} in scanline ${y}`);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = previous[x];
      const c = x >= bpp ? previous[x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = (pixels[start + 1 + x] + predictor) & 0xff;
    }
    if (header.colourType === 3) {
      for (let x = 0; x < stride; x++) if (row[x] >= paletteEntries) throw new Error(`palette index ${row[x]} out of range in scanline ${y}`);
    }
    [previous, row] = [row, previous];
  }
  return { width: header.width, height: header.height };
}

/**
 * Parses an SVG as XML and returns its size, or throws. The file must be
 * well-formed (xmldom reports undefined entities, content after the root
 * element and unquoted attributes only as errors or warnings, so any report
 * rejects the file), its root must be an SVG <svg> element, and it must not be
 * a PlantUML error image.
 */
export function svgSize(text: string): ImageSize {
  if (!text.trim()) throw new Error('empty file');
  if (!text.trimEnd().endsWith('</svg>')) throw new Error('no closing </svg> (file truncated)');
  const reports: string[] = [];
  let doc: ReturnType<DOMParser['parseFromString']> | null = null;
  try {
    doc = new DOMParser({ onError: (level, message) => { reports.push(`${level}: ${String(message).split('\n')[0]}`); } }).parseFromString(text, 'image/svg+xml');
  } catch (e) {
    if (!reports.length) reports.push(String((e as Error).message).split('\n')[0]);
  }
  if (reports.length || !doc) throw new Error(`not well-formed XML (${reports[0]})`);
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NAMESPACE) throw new Error('root element is not an SVG <svg> element');
  if (PLANTUML_ERROR.test(root.textContent ?? '')) throw new Error('PlantUML drew an error image');
  const length = (value: string | null) => Number(/^\s*([\d.]+)(?:px)?\s*$/.exec(value ?? '')?.[1] ?? NaN);
  const viewBox = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const width = length(root.getAttribute('width')) || viewBox[2];
  const height = length(root.getAttribute('height')) || viewBox[3];
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

/** Validates one diagram's exports and builds its manifest record; throws instead of recording invalid exports. */
export function recordDiagram(umlDir: string, outDir: string, name: string): DiagramRecord {
  const { problems, svg: svgDims, png: pngDims } = inspectDiagram(outDir, name);
  if (problems.length || !svgDims || !pngDims) {
    throw new Error(`refusing to record ${name}: ${problems.map((p) => `${p.file} ${p.kind} — ${p.detail}`).join('; ')}`);
  }
  const sizes = { svg: svgDims, png: pngDims };
  const file = (ext: string) => readFileSync(join(outDir, `${name}.${ext}`));
  return {
    source: `docs/uml/${name}.puml`,
    sourceSha256: sourceSha256(readFileSync(join(umlDir, `${name}.puml`), 'utf8')),
    svg: { sha256: sha256(file('svg')), width: Math.round(sizes.svg.width), height: Math.round(sizes.svg.height) },
    png: { sha256: sha256(file('png')), width: sizes.png.width, height: sizes.png.height },
  };
}
