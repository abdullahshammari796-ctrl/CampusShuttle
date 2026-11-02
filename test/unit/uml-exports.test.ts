import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { PROJECT_ROOT } from '../../src/config.ts';
import { type UmlManifest, checkExports, inspectDiagram, pngSize, recordDiagram, sha256, sourceSha256, svgSize } from '../../scripts/uml-exports.ts';

const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A complete 8-bit PNG (greyscale by default, or palette with `palette` entries) whose pixels are all `value`. */
function png(width: number, height: number, options: { palette?: number; value?: number; interlace?: number } = {}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = options.palette ? 3 : 0;
  ihdr[12] = options.interlace ?? 0;
  const rows = Buffer.alloc((width + 1) * height, options.value ?? (options.palette ? 0 : 0xff));
  for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0; // filter byte per row
  const plte = options.palette ? [chunk('PLTE', Buffer.alloc(options.palette * 3, 0x80))] : [];
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), ...plte, chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/** Rewrites a real PNG's decompressed scanlines and re-encodes them with correct chunk CRCs (the reviewer's reproduction). */
function withScanlines(file: Buffer, edit: (pixels: Buffer) => void): Buffer {
  const chunks: Array<{ type: string; data: Buffer }> = [];
  for (let pos = 8; pos < file.length;) {
    const length = file.readUInt32BE(pos);
    chunks.push({ type: file.toString('latin1', pos + 4, pos + 8), data: file.subarray(pos + 8, pos + 8 + length) });
    pos += 12 + length;
  }
  const pixels = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  edit(pixels);
  const out = [SIGNATURE];
  let written = false;
  for (const c of chunks) {
    if (c.type !== 'IDAT') out.push(chunk(c.type, c.data));
    else if (!written) { out.push(chunk('IDAT', deflateSync(pixels))); written = true; }
  }
  return Buffer.concat(out);
}

const svg = (width: number, height: number, label = 'Trip') =>
  `<?xml version="1.0" encoding="us-ascii" standalone="no"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}"><text>${label}</text></svg>`;
const listed = (problems: Array<{ file: string; kind: string }>) => problems.map((p) => `${p.file}:${p.kind}`);
const committed = (ext: 'svg' | 'png') => resolve(PROJECT_ROOT, 'docs', 'uml', 'out', `01-use-case-diagram.${ext}`);
/** The independent review's malformed pair, made from the committed diagram 01. */
const malformedPair = () => ({
  svg: readFileSync(committed('svg'), 'utf8').replace('</svg>', '<g></svg>'), // unmatched <g>
  png: withScanlines(readFileSync(committed('png')), (pixels) => { pixels[0] = 5; }), // filter types are 0–4
});

describe('UML export validation (render-uml, uml:check, docs:build)', () => {
  it('rejects empty, truncated and corrupt exports that a file-exists check would accept', () => {
    assert.deepEqual(pngSize(png(40, 20)), { width: 40, height: 20 });
    assert.throws(() => pngSize(Buffer.alloc(0)), /empty file/); // PNGs 03 and 06 in the independent review run
    const full = png(40, 20);
    assert.throws(() => pngSize(full.subarray(0, full.length - 12)), /no IEND|truncated/);
    const flipped = Buffer.from(full);
    flipped[45] ^= 0xff; // one byte of IDAT data (the chunk's data starts at byte 41)
    assert.throws(() => pngSize(flipped), /CRC mismatch/);
    assert.deepEqual(svgSize(svg(1343, 1416)), { width: 1343, height: 1416 });
    assert.throws(() => svgSize(svg(1343, 1416).slice(0, -6)), /no closing <\/svg>/);
    assert.throws(() => svgSize(svg(300, 100, 'Syntax Error?')), /error image/);
  });

  it('rejects well-wrapped exports whose content does not parse or decode', () => {
    const { svg: badSvg, png: badPng } = malformedPair();
    assert.doesNotThrow(() => svgSize(readFileSync(committed('svg'), 'utf8'))); // the real exports parse and decode
    assert.doesNotThrow(() => pngSize(readFileSync(committed('png'))));
    assert.throws(() => svgSize(badSvg), /not well-formed XML.*mismatch/);
    assert.throws(() => svgSize(svg(30, 10).replace('<text>', '<text>&undefined;')), /not well-formed XML/);
    assert.throws(() => svgSize(svg(30, 10).replace('<svg ', '<svg data-x=unquoted ')), /not well-formed XML/);
    assert.throws(() => pngSize(badPng), /invalid filter type 5 in scanline 0/); // CRCs and sizes are all valid
    assert.deepEqual(pngSize(png(4, 3, { palette: 2, value: 1 })), { width: 4, height: 3 });
    assert.throws(() => pngSize(png(4, 3, { palette: 2, value: 2 })), /palette index 2 out of range/);
    assert.throws(() => pngSize(png(4, 3, { interlace: 1 })), /unsupported PNG encoding/);
    assert.throws(() => pngSize(Buffer.concat([png(4, 3), Buffer.from([0])])), /after IEND/);
  });

  it('flags a PNG clipped by PLANTUML_LIMIT_SIZE although both files decode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uml-exports-'));
    try {
      writeFileSync(join(dir, '08-class-diagram-tracking.svg'), svg(4176, 1547));
      writeFileSync(join(dir, '08-class-diagram-tracking.png'), png(4096, 1547)); // what the default 4096 px limit produced
      assert.deepEqual(listed(inspectDiagram(dir, '08-class-diagram-tracking').problems), ['08-class-diagram-tracking.png:truncated']);
      writeFileSync(join(dir, '08-class-diagram-tracking.png'), png(4175, 1546)); // within one pixel of the SVG: accepted
      assert.deepEqual(inspectDiagram(dir, '08-class-diagram-tracking').problems, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to record malformed exports, and the manifest check rejects them even when their hashes match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uml-exports-'));
    try {
      const source = '@startuml\nclass Example\n@enduml\n';
      writeFileSync(join(dir, 'pair.puml'), source);
      const { svg: badSvg, png: badPng } = malformedPair();
      writeFileSync(join(dir, 'pair.svg'), badSvg);
      writeFileSync(join(dir, 'pair.png'), badPng);
      // A manifest whose hashes match these bytes, as a renderer without content checks would have written it.
      const manifest = (record: UmlManifest['diagrams'][string]): UmlManifest => ({
        generator: 'test', renderedAt: '', renderer: { plantumlJar: '', jarSha256: '', java: '', limitSize: 8192 }, diagrams: { pair: record },
      });
      const matchingHashes = manifest({
        source: 'docs/uml/pair.puml', sourceSha256: sourceSha256(source),
        svg: { sha256: sha256(badSvg), width: 1226, height: 1361 }, png: { sha256: sha256(badPng), width: 1225, height: 1360 },
      });
      assert.deepEqual(listed(checkExports(dir, dir, matchingHashes)), ['pair.svg:corrupt', 'pair.png:corrupt']);
      assert.throws(() => recordDiagram(dir, dir, 'pair'), /refusing to record pair: pair\.svg corrupt.*pair\.png corrupt/);

      copyFileSync(committed('svg'), join(dir, 'pair.svg'));
      copyFileSync(committed('png'), join(dir, 'pair.png'));
      assert.deepEqual(checkExports(dir, dir, manifest(recordDiagram(dir, dir, 'pair'))), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports missing, stale, replaced and orphaned exports against the render manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uml-exports-'));
    try {
      writeFileSync(join(dir, 'a.puml'), '@startuml\nclass Trip\n@enduml\n');
      writeFileSync(join(dir, 'b.puml'), '@startuml\nclass Stop\n@enduml\n');
      for (const name of ['a', 'b']) {
        writeFileSync(join(dir, `${name}.svg`), svg(30, 10));
        writeFileSync(join(dir, `${name}.png`), png(30, 10));
      }
      const manifest: UmlManifest = {
        generator: 'test', renderedAt: '2026-11-02T00:00:00.000Z',
        renderer: { plantumlJar: 'plantuml-mit-1.2026.9.jar', jarSha256: '0', java: 'test', limitSize: 8192 },
        diagrams: { a: recordDiagram(dir, dir, 'a'), b: recordDiagram(dir, dir, 'b') },
      };
      assert.deepEqual(checkExports(dir, dir, manifest), []);
      writeFileSync(join(dir, 'a.puml'), '@startuml\r\nclass Trip\r\n@enduml\r\n'); // a CRLF checkout of the same source
      assert.deepEqual(checkExports(dir, dir, manifest), []);
      assert.deepEqual(listed(checkExports(dir, dir, null)), ['manifest.json:unrecorded', 'manifest.json:unrecorded']);

      writeFileSync(join(dir, 'a.puml'), '@startuml\nclass Trip\nclass Route\n@enduml\n'); // edited after rendering
      writeFileSync(join(dir, 'b.svg'), svg(30, 10, 'Stop (edited by hand)')); // replaced after rendering
      unlinkSync(join(dir, 'b.png'));
      assert.deepEqual(listed(checkExports(dir, dir, manifest)), ['a.puml:stale', 'b.png:missing']);
      writeFileSync(join(dir, 'b.png'), png(30, 10));
      writeFileSync(join(dir, 'c.svg'), svg(30, 10)); // its source was deleted
      assert.deepEqual(listed(checkExports(dir, dir, manifest)), ['a.puml:stale', 'b.svg:stale', 'c.svg:orphan']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
