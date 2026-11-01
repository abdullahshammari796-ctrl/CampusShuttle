import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { type UmlManifest, checkExports, inspectDiagram, pngSize, recordDiagram, svgSize } from '../../scripts/uml-exports.ts';

/** A complete greyscale PNG of the given size. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth; colour type 0 = greyscale
  const rows = Buffer.alloc((width + 1) * height, 0xff);
  for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0; // filter byte per row
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const svg = (width: number, height: number, label = 'Trip') =>
  `<?xml version="1.0" encoding="us-ascii" standalone="no"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}"><text>${label}</text></svg>`;
const listed = (problems: Array<{ file: string; kind: string }>) => problems.map((p) => `${p.file}:${p.kind}`);

describe('UML export validation (render-uml, uml:check, docs:build)', () => {
  it('rejects empty, truncated and corrupt exports that a file-exists check would accept', () => {
    assert.deepEqual(pngSize(png(40, 20)), { width: 40, height: 20 });
    assert.throws(() => pngSize(Buffer.alloc(0)), /empty file/); // PNGs 03 and 06 in the independent review run
    const full = png(40, 20);
    assert.throws(() => pngSize(full.subarray(0, full.length - 12)), /no IEND|truncated/);
    const flipped = Buffer.from(full);
    flipped[40] ^= 0xff; // one byte inside IDAT
    assert.throws(() => pngSize(flipped), /CRC mismatch/);
    assert.deepEqual(svgSize(svg(1343, 1416)), { width: 1343, height: 1416 });
    assert.throws(() => svgSize(svg(1343, 1416).slice(0, -6)), /no closing <\/svg>/);
    assert.throws(() => svgSize(svg(300, 100, 'Syntax Error?')), /error image/);
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

  it('reports missing, stale, replaced and orphaned exports against the render manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uml-exports-'));
    try {
      writeFileSync(join(dir, 'a.puml'), '@startuml\nclass Trip\n@enduml\n');
      writeFileSync(join(dir, 'b.puml'), '@startuml\nclass Stop\n@enduml\n');
      for (const name of ['a', 'b']) {
        writeFileSync(join(dir, `${name}.svg`), svg(30, 10));
        writeFileSync(join(dir, `${name}.png`), png(30, 10));
      }
      const size = { svg: { width: 30, height: 10 }, png: { width: 30, height: 10 } };
      const manifest: UmlManifest = {
        generator: 'test', renderedAt: '2026-11-02T00:00:00.000Z',
        renderer: { plantumlJar: 'plantuml-mit-1.2026.9.jar', jarSha256: '0', java: 'test', limitSize: 8192 },
        diagrams: { a: recordDiagram(dir, dir, 'a', size), b: recordDiagram(dir, dir, 'b', size) },
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
