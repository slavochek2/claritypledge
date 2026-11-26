/** P1722 AC: `/tree/solo-clarify` is gone (DEV route, tree index entry, lazy import, source files). */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

describe('/tree/solo-clarify is removed', () => {
  it('no source file or folder under src/app/tree carries the name', () => {
    const files = walk(path.join(root, 'src/app/tree')).map((f) => f.toLowerCase());
    expect(files.filter((f) => /solo[-_]?clarify/.test(f))).toEqual([]);
    expect(existsSync(path.join(root, 'src/app/tree/solo-clarify'))).toBe(false);
  });
  it('the route table, App and the tree index name no such route or lazy import', () => {
    for (const f of ['src/app/tree/tree-routes.tsx', 'src/App.tsx']) {
      expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/solo[-_ ]?clarify/i);
    }
    const index = walk(path.join(root, 'src/app')).filter((f) => /tree[^/]*index|TreeIndex|tree-index/i.test(f));
    for (const f of index) expect(readFileSync(f, 'utf8'), f).not.toMatch(/solo[-_ ]?clarify/i);
  });
});
