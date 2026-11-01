import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Architecture conformance test: the component boundaries in the design
 * documents are enforced on the actual source code. If someone adds an
 * import that breaks the layering, this test fails.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Which components each component may depend on (besides itself). */
const ALLOWED: Record<string, string[]> = {
  shared: [],
  network: ['shared'],
  identity: ['shared'],
  tracking: ['shared', 'network'],
  demand: ['shared', 'network'],
  realtime: ['shared', 'identity', 'tracking', 'demand'],
  persistence: ['shared', 'network', 'identity', 'tracking', 'demand'],
  web: ['shared', 'identity', 'network', 'tracking', 'demand', 'realtime'],
  seed: ['shared', 'identity', 'network', 'demand', 'persistence'],
};
// Composition root and configuration may wire everything together.
const ROOT_FILES = new Set(['main.ts', 'container.ts', 'config.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

function componentOf(file: string): string {
  const rel = relative(SRC, file).split(sep);
  return rel.length === 1 ? rel[0] : rel[0];
}

function imports(file: string): Array<{ target: string; typeOnly: boolean }> {
  const text = readFileSync(file, 'utf8');
  const found: Array<{ target: string; typeOnly: boolean }> = [];
  for (const match of text.matchAll(/import\s+(type\s+)?[^'"]*?from\s+'(\.[^']+)'/g)) {
    found.push({ target: resolve(dirname(file), match[2]), typeOnly: Boolean(match[1]) });
  }
  return found;
}

const files = sourceFiles(SRC);

describe('Architecture conformance', () => {
  it('every component only depends on the components the design allows', () => {
    const violations: string[] = [];
    for (const file of files) {
      const from = componentOf(file);
      if (ROOT_FILES.has(from)) continue;
      assert.ok(from in ALLOWED, `unknown component folder: ${from}`);
      for (const { target } of imports(file)) {
        const to = componentOf(target);
        if (to === from) continue;
        if (!ALLOWED[from].includes(to)) violations.push(`${relative(SRC, file)} → ${relative(SRC, target)}`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it('tracking and demand never import each other (they communicate through domain events)', () => {
    for (const file of files) {
      const from = componentOf(file);
      if (from !== 'tracking' && from !== 'demand') continue;
      for (const { target } of imports(file)) {
        const to = componentOf(target);
        assert.ok(!(from === 'tracking' && to === 'demand') && !(from === 'demand' && to === 'tracking'), relative(SRC, file));
      }
    }
  });

  it('business components see the network component only through types (ports), never its implementation', () => {
    for (const file of files) {
      const from = componentOf(file);
      if (from !== 'tracking' && from !== 'demand') continue;
      for (const imp of imports(file)) {
        if (componentOf(imp.target) === 'network') assert.ok(imp.typeOnly, `${relative(SRC, file)} imports network at runtime`);
      }
    }
  });

  it('only the composition root and seeding know concrete persistence classes', () => {
    for (const file of files) {
      const from = componentOf(file);
      for (const { target } of imports(file)) {
        if (componentOf(target) === 'persistence' && from !== 'persistence') {
          assert.ok(from === 'container.ts' || from === 'seed', `${relative(SRC, file)} reaches into persistence`);
        }
      }
    }
  });
});
