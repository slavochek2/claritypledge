// A `/* … */` written between JSX children is not a comment — it renders as visible text.
// Shipped to prod once (feed point cards showed a P1445 code comment). Guards every .tsx in src/ and tools/.
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

export function findCommentLikeJsxText(source: string, fileName = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && /\/\*|\*\/|(^|\n)\s*\/\//.test(node.text)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      hits.push(`${fileName}:${line + 1}: ${node.text.trim().slice(0, 60)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe('JSX comment leak guard', () => {
  it('flags a bare comment between JSX children (control)', () => {
    expect(findCommentLikeJsxText('const a = <div>\n  /* oops */\n  <span/></div>;')).toHaveLength(1);
  });

  it('flags mid-line and stray-close comment text (control)', () => {
    expect(findCommentLikeJsxText('const a = <div>Hi /* oops */ <b/></div>;')).toHaveLength(1);
    expect(findCommentLikeJsxText('const a = <div>{/* a */} */<b/></div>;')).toHaveLength(1);
  });

  it('allows a braced JSX comment (control)', () => {
    expect(findCommentLikeJsxText('const a = <div>\n  {/* fine */}\n  <span/></div>;')).toHaveLength(0);
  });

  it('no .tsx under src/ or tools/ renders a comment as text', () => {
    const root = join(__dirname, '..', '..');
    const files = [join(root, 'src'), join(root, 'tools')].flatMap((d) =>
      tsxFiles(d).filter((f) => !f.includes('node_modules')),
    );
    expect(files.length).toBeGreaterThan(50);
    const hits = files.flatMap((f) => findCommentLikeJsxText(readFileSync(f, 'utf8'), f));
    expect(hits).toEqual([]);
    // P1394: this parses every .tsx in the repo (~700 files) with the TypeScript compiler: ~0.5s on a
    // quiet machine, median ~6s and up to 8.7s in loaded full-suite runs, past Vitest's default 5s.
  }, 30_000);
});
