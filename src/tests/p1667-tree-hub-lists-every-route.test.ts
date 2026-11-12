// The /tree hub is a hand-written list. A route registered in tree-routes.tsx but missing from
// TreePage.tsx is unreachable from the hub, and a hub link to an unregistered route is a dead link.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const routesSource = readFileSync(join(root, 'src/app/tree/tree-routes.tsx'), 'utf8');
const hubSource = readFileSync(join(root, 'src/app/pages/TreePage.tsx'), 'utf8');

const registered = [...routesSource.matchAll(/path="(\/tree[^"]*)"/g)].map((m) => m[1]);
const listed = [...hubSource.matchAll(/path:\s*'(\/tree[^']*)'/g)].map((m) => m[1]);

describe('P1667: the /tree hub lists every /tree route', () => {
  it('parses the registered routes (a parser that finds nothing cannot pass)', () => {
    for (const known of ['/tree/landing-fable', '/tree/landing-fable-change', '/tree/_gate/example', '/tree/404-drift']) {
      expect(registered).toContain(known);
    }
    expect(registered.length).toBeGreaterThan(30);
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
