// The /tree hub is a hand-written list. A route registered in tree-routes.tsx but missing from
// TreePage.tsx is unreachable from the hub, and a hub link to an unregistered route is a dead link.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
// Comments are dropped first, so a commented-out route or hub entry is not counted as a live one:
// block comments, whole-line comments and a comment trailing code. A `//` counts as a comment only
// at the start of a line or after whitespace, so the `//` inside a URL is left alone.
// Known limit of reading source text: a path built from a constant or a template is not seen.
// Both files write every path as a plain string today; the floors below catch a parser gone blind.
const stripComments =(source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const routesSource = stripComments(readFileSync(join(root, 'src/app/tree/tree-routes.tsx'), 'utf8'));
const hubSource = stripComments(readFileSync(join(root, 'src/app/pages/TreePage.tsx'), 'utf8'));

// Either quote style on both sides, so an entry written with the other quote is still read.
const registered = [...routesSource.matchAll(/path=["'](\/tree[^"']*)["']/g)].map((m) => m[1]);
const listed = [...hubSource.matchAll(/path:\s*["'](\/tree[^"']*)["']/g)].map((m) => m[1]);

describe('P1667: the /tree hub lists every /tree route', () => {
  it('does not count a commented-out entry, whatever kind of comment hides it', () => {
    const paths = (source: string) => [...stripComments(source).matchAll(/path:\s*["'](\/tree[^"']*)["']/g)].map((m) => m[1]);
    expect(paths("  // { path: '/tree/gone' },")).toEqual([]);
    expect(paths("const entries = []; // path: '/tree/gone'")).toEqual([]);
    expect(paths("/* path: '/tree/gone' */ { path: '/tree/kept' }")).toEqual(['/tree/kept']);
    // A URL keeps its `//`, and the entry on the same line is still read.
    expect(paths("{ path: '/tree/kept', description: 'see https://example.com/x' },")).toEqual(['/tree/kept']);
  });

  it('parses the registered routes (a parser that finds nothing cannot pass)', () => {
    for (const known of ['/tree/landing-fable', '/tree/landing-fable-change', '/tree/_gate/example', '/tree/404-drift']) {
      expect(registered).toContain(known);
    }
    expect(registered.length).toBeGreaterThan(30);
  });

  it('parses the hub entries (same floor, same reason)', () => {
    for (const known of ['/tree/landing-fable', '/tree/landing-fable-change', '/tree/_gate/example', '/tree/404-drift']) {
      expect(listed).toContain(known);
    }
    expect(listed.length).toBeGreaterThan(30);
  });

  it('lists every registered route except the hub itself', () => {
    const missing = registered.filter((p) => p !== '/tree' && !listed.includes(p));
    expect(missing, `Routes registered but missing from TreePage.tsx: ${missing.join(', ')}`).toEqual([]);
  });

  it('links only to registered routes', () => {
    const dead = listed.filter((p) => !registered.includes(p));
    expect(dead, `Hub entries with no registered route: ${dead.join(', ')}`).toEqual([]);
  });
});
