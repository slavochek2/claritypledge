/**
 * @file p1509-v16-route-audit.test.ts
 * @description P1509 v16: pins scripts/p1509-route-audit.mjs, the closed route list the parity audit relies on.
 * Each fixture is a shape a reviewer used to break the regex version with; the real-App.tsx block proves the
 * list is complete today and that the failure path fires when a route the parser cannot read is introduced.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditRoutes, auditSource, listRoutes } from '../../scripts/p1509-route-audit.mjs';

const repoRoot = path.resolve(__dirname, '../..');
const script = path.join(repoRoot, 'scripts/p1509-route-audit.mjs');
const appFile = path.join(repoRoot, 'src/App.tsx');

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'p1509-route-audit-'));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const wrap = (body: string) => `import { Routes, Route } from 'react-router-dom';\nexport const A = () => (<Routes>${body}</Routes>);`;
const paths = (src: string) => auditSource(wrap(src), path.join(tmp, 'entry.tsx'), { root: tmp }).rows.map((r) => r.path);
const audit = (src: string) => auditSource(wrap(src), path.join(tmp, 'entry.tsx'), { root: tmp });

describe('route shapes the regex version dropped or misread', () => {
  it('reads a route whose element comes before path (lazy regex stopped at the first >)', () => {
    expect(paths(`<Route element={<L />} path="/a" />`)).toEqual(['/a']);
  });

  it('reads a route with `>` inside an attribute expression', () => {
    expect(paths(`<Route caseSensitive={a > b} path="/c" element={<X />} />`)).toEqual(['/c']);
  });

  it('puts a spread-only route in unread instead of dropping it', () => {
    const r = audit(`<Route {...p} />`);
    expect(r.rows).toEqual([]);
    expect(r.unread).toHaveLength(1);
    expect(r.unread[0]?.reason).toMatch(/spread/);
  });

  it.each([
    ['before the path', `<Route {...p} path="/s" element={<X />} />`],
    ['after the path', `<Route path="/old" {...props} />`],
  ])('puts a route with a spread %s in unread (the spread can override path at runtime)', (_l, body) => {
    const r = audit(body);
    expect(r.rows).toEqual([]);
    expect(r.unread).toHaveLength(1);
    expect(r.unread[0]?.reason).toMatch(/spread/);
  });

  it('ignores a commented-out route (JSX comment and line comment)', () => {
    const r = audit(`{/* <Route path="/dead" element={<X />} /> */}\n<Route path="/live" element={<X />} />\n{/* <Route path="/dead2" /> */}`);
    expect(r.rows.map((x) => x.path)).toEqual(['/live']);
  });

  it('marks devOnly from a DEV guard on the previous line', () => {
    const r = audit(`{import.meta.env.DEV && (\n  <Route path="/d" element={<X />} />\n)}\n<Route path="/p" element={<X />} />`);
    expect(r.rows.map((x) => [x.path, x.devOnly])).toEqual([['/d', true], ['/p', false]]);
  });

  it('marks devOnly through an aliased const and a ternary', () => {
    const src = `const isDev = import.meta.env.DEV;\nexport const A = () => (<Routes>{isDev && <Route path="/a" element={<X />} />}{import.meta.env.DEV ? <Route path="/b" element={<X />} /> : null}<Route path="/c" element={<X />} /></Routes>);`;
    const r = auditSource(src, path.join(tmp, 'entry.tsx'), { root: tmp });
    expect(r.rows.map((x) => [x.path, x.devOnly])).toEqual([['/a', true], ['/b', true], ['/c', false]]);
  });

  it('composes nested relative children and resolves index to the parent', () => {
    const r = audit(`<Route path="/settings" element={<S />}><Route index element={<I />} /><Route path="profile" element={<P />} /><Route path="tree/x" element={<T />} /></Route>`);
    expect(r.rows.map((x) => x.path)).toEqual(['/settings', '/settings', '/settings/profile', '/settings/tree/x']);
    expect(listRoutes(audit(`<Route path="tree" element={<S />}><Route path="x" element={<T />} /></Route>`).rows)).toEqual([]);
  });

  it('uses an absolute child path as-is when it starts with its parent, and flags one that does not', () => {
    const ok = audit(`<Route path="/settings" element={<S />}><Route path="/settings/profile" element={<P />} /></Route>`);
    expect(ok.rows.map((x) => x.path)).toEqual(['/settings', '/settings/profile']);
    expect(ok.unread).toEqual([]);
    const bad = audit(`<Route path="/settings" element={<S />}><Route path="/other/profile" element={<P />} /><Route path="/settingsx" element={<P />} /></Route>`);
    expect(bad.rows.map((x) => x.path)).toEqual(['/settings']);
    expect(bad.unread).toHaveLength(2);
    expect(bad.unread[0]?.reason).toMatch(/absolute child/);
  });

  it('treats a pathless, indexless route as a layout and composes its children against the parent', () => {
    const r = audit(`<Route element={<Layout />}><Route path="/inside" element={<X />} /></Route>`);
    expect(r.rows.map((x) => x.path)).toEqual(['/inside']);
    expect(r.unread).toEqual([]);
  });

  it('flags redirects by <Navigate> and by a component name ending in Redirect', () => {
    const r = audit(`<Route path="/n" element={<Navigate to="/" />} /><Route path="/o" element={<OldRedirect />} /><Route path="/x" element={<X />} />`);
    expect(r.rows.map((x) => [x.path, x.redirect])).toEqual([['/n', true], ['/o', true], ['/x', false]]);
  });

  it('keeps a bare * catch-all as a leaf, not a mount', () => {
    const r = audit(`<Route path="*" element={<NotFound />} />`);
    expect(r.rows.map((x) => x.path)).toEqual(['/*']);
    expect(r.unread).toEqual([]);
  });
});

describe('unreadable paths fail loud', () => {
  it.each([
    ['identifier', `<Route path={dyn} element={<X />} />`],
    ['template with substitution', '<Route path={`/a/${id}`} element={<X />} />'],
    ['member expression', `<Route path={PATHS.home} element={<X />} />`],
    ['valueless path', `<Route path element={<X />} />`],
  ])('puts a %s path in unread with its line', (_label, body) => {
    const r = audit(body);
    expect(r.rows).toEqual([]);
    expect(r.unread).toHaveLength(1);
    expect(r.unread[0]?.line).toBeGreaterThan(0);
  });

  it('accepts a string literal in braces and a no-substitution template', () => {
    expect(paths('<Route path={"/q"} element={<X />} /><Route path={`/t`} element={<X />} />')).toEqual(['/q', '/t']);
  });
});

describe('following /* mounts into the file that holds the nested <Routes>', () => {
  const child = `import { Routes, Route } from 'react-router-dom';
export function Child() {
  return (<Routes><Route path="/" element={<Home />} /><Route path="list" element={<L />} /><Route path=":slug/edit" element={<E />} /></Routes>);
}`;

  it('follows a static import via the @/ alias and prefixes child paths', () => {
    mkdirSync(path.join(tmp, 'src/mod'), { recursive: true });
    writeFileSync(path.join(tmp, 'src/mod/index.tsx'), child);
    const src = `import { Child } from '@/mod';\nexport const A = () => (<Routes><Route path="/m/*" element={<Layout><Child /></Layout>} /></Routes>);`;
    const r = auditSource(src, path.join(tmp, 'src/entry.tsx'), { root: tmp });
    expect(r.unread).toEqual([]);
    expect(r.rows.map((x) => x.path)).toEqual(['/m/*', '/m', '/m/list', '/m/:slug/edit']);
    expect(r.mounts).toEqual([{ path: '/m', file: path.join('src', 'mod', 'index.tsx') }]);
  });

  it('follows a lazy import() with a relative specifier and inherits devOnly', () => {
    mkdirSync(path.join(tmp, 'src/lz'), { recursive: true });
    writeFileSync(path.join(tmp, 'src/lz/child.tsx'), child);
    const src = `import { lazy } from 'react';\nconst Child = lazy(() => import('./lz/child').then(m => ({ default: m.Child })));\nexport const A = () => (<Routes>{import.meta.env.DEV && <Route path="/z/*" element={<Child />} />}</Routes>);`;
    const r = auditSource(src, path.join(tmp, 'src/entry.tsx'), { root: tmp });
    expect(r.unread).toEqual([]);
    expect(r.rows.map((x) => [x.path, x.devOnly])).toEqual([['/z/*', true], ['/z', true], ['/z/list', true], ['/z/:slug/edit', true]]);
  });

  it('puts an unresolvable /* target in unread', () => {
    const src = `import { Ghost } from '@/does-not-exist';\nexport const A = () => (<Routes><Route path="/g/*" element={<Ghost />} /></Routes>);`;
    const r = auditSource(src, path.join(tmp, 'src/entry.tsx'), { root: tmp });
    expect(r.unread).toHaveLength(1);
    expect(r.unread[0]?.reason).toMatch(/\/\* mount/);
  });

  it('puts a /* target that renders no <Routes> in unread, but lets a Redirect target through', () => {
    writeFileSync(path.join(tmp, 'src/flat.tsx'), `export function Flat() { return <div />; }`);
    const src = `import { Flat } from '@/flat';\nconst OldRedirect = () => null;\nexport const A = () => (<Routes><Route path="/f/*" element={<Flat />} /><Route path="/r/*" element={<OldRedirect />} /></Routes>);`;
    const r = auditSource(src, path.join(tmp, 'src/entry.tsx'), { root: tmp });
    expect(r.unread).toHaveLength(1);
    expect(r.unread[0]?.text).toContain('/f/*');
    expect(r.rows.find((x) => x.path === '/r/*')?.redirect).toBe(true);
  });

  it('treats absolute paths in a followed mount as relative to the mount (react-router descendant <Routes>)', () => {
    writeFileSync(
      path.join(tmp, 'src/abs.tsx'),
      `import { Routes, Route } from 'react-router-dom';\nexport function Abs() { return (<Routes><Route path="/x" element={<X />} /></Routes>); }`,
    );
    const src = `import { Abs } from '@/abs';\nexport const A = () => (<Routes><Route path="/m/*" element={<Abs />} /></Routes>);`;
    const r = auditSource(src, path.join(tmp, 'src/entry.tsx'), { root: tmp });
    expect(r.unread).toEqual([]);
    expect(r.rows.map((x) => x.path)).toEqual(['/m/*', '/m/x']);
  });

  it('reports a real self-mount as a cycle in unread instead of recursing forever', () => {
    writeFileSync(
      path.join(tmp, 'src/self.tsx'),
      `import { Routes, Route } from 'react-router-dom';\nexport function Self() { return (<Routes><Route path="a" element={<X />} /><Route path="loop/*" element={<Self />} /></Routes>); }`,
    );
    const src = `import { Self } from '@/self';\nexport const A = () => (<Routes><Route path="/s/*" element={<Self />} /></Routes>);`;
    const r = auditSource(src, path.join(tmp, 'src/entry.tsx'), { root: tmp });
    expect(r.rows.map((x) => x.path)).toContain('/s/a');
    expect(r.unread).toHaveLength(1);
    expect(r.unread[0]?.reason).toMatch(/cycle/);
  });

  it('reports a two-file mount cycle', () => {
    writeFileSync(path.join(tmp, 'src/ping.tsx'), `import { Pong } from '@/pong';\nexport function Ping() { return (<Routes><Route path="p/*" element={<Pong />} /></Routes>); }`);
    writeFileSync(path.join(tmp, 'src/pong.tsx'), `import { Ping } from '@/ping';\nexport function Pong() { return (<Routes><Route path="q/*" element={<Ping />} /></Routes>); }`);
    const src = `import { Ping } from '@/ping';\nexport const A = () => (<Routes><Route path="/c/*" element={<Ping />} /></Routes>);`;
    const r = auditSource(src, path.join(tmp, 'src/entry.tsx'), { root: tmp });
    expect(r.unread.some((u) => /cycle/.test(u.reason))).toBe(true);
  });

  it('follows a namespace-import member component as a /* mount', () => {
    mkdirSync(path.join(tmp, 'src/ns'), { recursive: true });
    writeFileSync(path.join(tmp, 'src/ns/index.tsx'), child);
    const src = `import * as Events from '@/ns';\nexport const A = () => (<Routes><Route path="/e/*" element={<Events.Child />} /></Routes>);`;
    const r = auditSource(src, path.join(tmp, 'src/entry.tsx'), { root: tmp });
    expect(r.unread).toEqual([]);
    expect(r.rows.map((x) => x.path)).toEqual(['/e/*', '/e', '/e/list', '/e/:slug/edit']);
  });

  it('puts an unresolvable member-expression /* target in unread, never skips it', () => {
    const src = `import { Events } from 'some-package';\nexport const A = () => (<Routes><Route path="/e/*" element={<Events.Router />} /></Routes>);`;
    const r = auditSource(src, path.join(tmp, 'src/entry.tsx'), { root: tmp });
    expect(r.unread).toHaveLength(1);
    expect(r.unread[0]?.reason).toMatch(/member-expression/);
  });

  it('flags a member-expression redirect element', () => {
    expect(audit(`<Route path="/r" element={<Legacy.Redirect />} />`).rows.map((x) => x.redirect)).toEqual([true]);
  });
});

describe('the real src/App.tsx', () => {
  const real = auditRoutes(appFile);
  const list = listRoutes(real.rows).map((r) => r.path);

  it('has no unreadable routes', () => {
    expect(real.unread).toEqual([]);
  });

  it('follows /events/* into the events router and lists its children', () => {
    expect(real.mounts.map((m) => m.path)).toContain('/events');
    for (const p of ['/events/list', '/events/new', '/events/:slug', '/events/:slug/edit', '/events/:slug/confirm']) {
      expect(list).toContain(p);
    }
  });

  it('lists at least the 95 top-level paths the regex version found, with /tree excluded', () => {
    expect(list.length).toBeGreaterThanOrEqual(95);
    expect(list.filter((p) => p === '/tree' || p.startsWith('/tree/'))).toEqual([]);
  });

  it('CLI prints one path per line and exits 0', () => {
    const r = spawnSync('node', [script], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n')).toEqual(list);
  });

  it('control: a route with a dynamic path inserted into a copy of App.tsx makes the CLI exit 1 naming file:line', () => {
    const src = readFileSync(appFile, 'utf8');
    const anchor = '<Route path="/cm"';
    expect(src).toContain(anchor);
    const mutated = src.replace(anchor, `<Route element={<X />} path={dyn} />\n        ${anchor}`);
    expect(mutated).not.toBe(src);
    const viaApi = auditSource(mutated, appFile);
    expect(viaApi.unread).toHaveLength(1);

    const copy = path.join(tmp, 'App.mutated.tsx');
    writeFileSync(copy, mutated);
    const r = spawnSync('node', [script, copy], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/:\d+\s+path is not a string literal/);
  });

  it('control: a /* mount pointing nowhere inserted into a copy of App.tsx makes the CLI exit 1', () => {
    const src = readFileSync(appFile, 'utf8');
    const mutated = src.replace('<Route path="/cm"', '<Route path="/ghost/*" element={<NotARouter />} />\n        <Route path="/cm"');
    const copy = path.join(tmp, 'App.ghost.tsx');
    writeFileSync(copy, mutated);
    expect(spawnSync('node', [script, copy], { encoding: 'utf8' }).status).toBe(1);
  });
});
