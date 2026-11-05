/**
 * @file p1607-e2e-server-wide-detector.test.ts
 * @description P1607: which e2e specs change server-wide state (and so must run alone) is DERIVED from
 * the code, never hand-listed. Each detection path has a known member (epistemic gate 7e), checked
 * twice: against a fixture tree, and against the REAL e2e tree and migrations (gate 7d: a fixture
 * with no examples can pass while the real file fails). Legitimate specs must stay parallel (gate 7c).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deriveServerWideNames, classifyFiles, listRunSpecs, detectServerWide, detectForArgv, allServerWideSpecs,
} from '../../scripts/lib/e2e-exclusive-specs.mjs';
import { withHermeticE2eEnv } from './helpers/hermetic-e2e-env';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const MIGRATION = `
CREATE TABLE IF NOT EXISTS public.kill_switch (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.per_user_things (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL
);
CREATE OR REPLACE FUNCTION public.thing_sweep_tick() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
CREATE OR REPLACE PROCEDURE public.thing_retry_tick() LANGUAGE sql AS $$ SELECT 1 $$;
DO $$ BEGIN
  PERFORM cron.schedule('thing_cleanup', '* * * * *', $job$ SELECT public.thing_cleanup_job() $job$);
END $$;
`;

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p1607d-'));
  dirs.push(root);
  fs.mkdirSync(path.join(root, 'supabase/migrations'), { recursive: true });
  fs.writeFileSync(path.join(root, 'supabase/migrations/20260101000000_x.sql'), MIGRATION);
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  return root;
}
const classify = (root: string, rels: string[]) =>
  classifyFiles(rels.map(r => path.join(root, r)), { repoDir: root });

describe('the names are derived from the migrations', () => {
  it('finds singleton tables and tick/cron functions, and not ordinary tables', () => {
    const root = fixture({});
    const n = deriveServerWideNames(path.join(root, 'supabase/migrations'));
    expect(n.singletonTables).toContain('kill_switch');
    expect(n.singletonTables).not.toContain('per_user_things');
    expect(n.tickFunctions).toEqual(expect.arrayContaining(['thing_sweep_tick', 'thing_retry_tick', 'thing_cleanup_job']));
  });

  it('on the REAL migrations: the kill switch and the known ticks are found (a parser that finds nothing cannot pass)', () => {
    const n = deriveServerWideNames(path.resolve('supabase/migrations'));
    expect(n.singletonTables).toContain('transcribe_channel_posting');
    expect(n.tickFunctions).toEqual(expect.arrayContaining(['transcribe_room_sweep_tick', 'transcribe_post_retry_tick']));
  });
});

describe('each detection path has a known member (fixture)', () => {
  it('path 1, a write to a singleton table, by client call or by SQL', () => {
    const root = fixture({
      'e2e/a.spec.ts': `await supabaseAdmin.from('kill_switch').update({ enabled: true }).eq('singleton', true);`,
      'e2e/b.spec.ts': 'await testDbSql(`UPDATE public.kill_switch SET enabled = true WHERE singleton`);',
    });
    const r = classify(root, ['e2e/a.spec.ts', 'e2e/b.spec.ts']);
    expect(r.get(path.join(root, 'e2e/a.spec.ts'))?.[0]).toMatch(/kill_switch/);
    expect(r.get(path.join(root, 'e2e/b.spec.ts'))?.[0]).toMatch(/kill_switch/);
  });
  it('path 2, a global tick or cron function called by RPC or SQL', () => {
    const root = fixture({
      'e2e/a.spec.ts': `await supabaseAdmin.rpc('thing_sweep_tick');`,
      'e2e/b.spec.ts': 'await testDbSql(`CALL public.thing_retry_tick()`);',
      'e2e/c.spec.ts': `await supabaseAdmin.rpc('thing_cleanup_job', {});`,
    });
    const r = classify(root, ['e2e/a.spec.ts', 'e2e/b.spec.ts', 'e2e/c.spec.ts']);
    for (const f of ['a', 'b', 'c']) expect(r.has(path.join(root, `e2e/${f}.spec.ts`))).toBe(true);
  });
  it('path 3, cron schedule changes', () => {
    const root = fixture({
      'e2e/a.spec.ts': 'await testDbSql(`SELECT cron.unschedule(\'x\')`);',
      'e2e/b.spec.ts': 'await testDbSql(`UPDATE cron.job SET active = false WHERE jobname = \'x\'`);',
    });
    const r = classify(root, ['e2e/a.spec.ts', 'e2e/b.spec.ts']);
    expect(r.size).toBe(2);
  });
  it('path 4, a write with no filter (client call or SQL)', () => {
    const root = fixture({
      'e2e/a.spec.ts': `await supabaseAdmin.from('per_user_things').delete();`,
      'e2e/b.spec.ts': 'await testDbSql(`DELETE FROM per_user_things`);',
      'e2e/c.spec.ts': 'await testDbSql(`TRUNCATE per_user_things`);',
      'e2e/d.spec.ts': 'await testDbSql(`UPDATE per_user_things SET owner_id = owner_id`);',
    });
    const r = classify(root, ['e2e/a.spec.ts', 'e2e/b.spec.ts', 'e2e/c.spec.ts', 'e2e/d.spec.ts']);
    expect(r.size).toBe(4);
  });
  it('a helper a spec imports counts, transitively, and the reason names it', () => {
    const root = fixture({
      'e2e/helpers/flip.ts': `export const flip = () => supabaseAdmin.from('kill_switch').update({ enabled: true }).eq('singleton', true);`,
      'e2e/helpers/mid.ts': `export * from './flip';`,
      'e2e/a.spec.ts': `import { flip } from './helpers/mid'; test('x', async () => { await flip(); });`,
    });
    const reason = classify(root, ['e2e/a.spec.ts']).get(path.join(root, 'e2e/a.spec.ts'));
    expect(reason?.[0]).toMatch(/helpers\/flip\.ts/);
  });
});

describe('legitimate specs stay parallel (false-positive control)', () => {
  it('scoped writes, upserts, reads of the kill switch, comments and scoped SQL are not exclusive', () => {
    const root = fixture({
      'e2e/ok1.spec.ts': `await supabaseAdmin.from('per_user_things').delete().eq('owner_id', id);
        await supabaseAdmin.from('per_user_things').update({ x: 1 }).in('id', ids);
        await supabaseAdmin.from('per_user_things').upsert({ id, owner_id });
        await supabaseAdmin.from('per_user_things').insert({ id });`,
      'e2e/ok2.spec.ts': `const { data } = await supabaseAdmin.from('kill_switch').select('enabled').eq('singleton', true).maybeSingle();`,
      'e2e/ok3.spec.ts': `// TRUNCATE is not verifiable here; UPDATE kill_switch SET enabled and thing_sweep_tick are only mentioned
        /* cron.unschedule in a block comment */ test('x', () => {});`,
      'e2e/ok4.spec.ts': 'await testDbSql(`UPDATE per_user_things SET x = 1 WHERE owner_id = \'${id}\'; DELETE FROM per_user_things WHERE id = \'${id}\'`);',
      'e2e/helpers/benign.ts': `export const b = () => 1;`,
      'e2e/ok6.spec.ts': `// a cache delete from another tab must never block
        const cls = 'truncate text-sm'; const msg = 'A name this long must truncate beside the menu';`,
      'e2e/ok5.spec.ts': `import { b } from './helpers/benign'; test('x', () => { b(); });`,
    });
    const r = classify(root, ['e2e/ok1.spec.ts', 'e2e/ok2.spec.ts', 'e2e/ok3.spec.ts', 'e2e/ok4.spec.ts', 'e2e/ok5.spec.ts', 'e2e/ok6.spec.ts']);
    expect([...r.keys()]).toEqual([]);
  });
});

describe('against the REAL e2e tree (control built from the real files, not a fixture)', () => {
  const root = path.resolve('.');
  const all = allServerWideSpecs({ repoDir: root });
  const rel = [...all.keys()].map(f => path.relative(root, f));
  it('names the annotated spec', () => { expect(rel).toContain('e2e/p1083-ready-distribution.spec.ts'); });

  it('names the kill-switch writers and the tick callers', () => {
    expect(rel).toEqual(expect.arrayContaining([
      'e2e/p1592-event-transcripts.spec.ts',
      'e2e/integration/p1596-clean-round-transcripts.spec.ts',
      'e2e/integration/p1307-sweep-tick.spec.ts',
    ]));
  });
  it('does not name ordinary specs', () => {
    expect(rel).not.toContain('e2e/logo-navigation.spec.ts');
    expect(rel).not.toContain('e2e/integration/p506-backfill-hashtags.spec.ts'); // scoped SQL update
    expect(rel).not.toContain('e2e/p705-letter-positions-live.spec.ts');
  });
  it('is a small minority: a detector that flags everything would make every run exclusive', () => {
    expect(rel.length).toBeGreaterThan(0);
    expect(rel.length).toBeLessThan(25);
  });
});

describe('path 5: the e2e-exclusive annotation (for what a text scan cannot see)', () => {
  it('a spec carrying the annotation is exclusive, with its reason', () => {
    const root = fixture({ 'e2e/a.spec.ts': `// e2e-exclusive: counts rows of a table every run writes to\ntest('x', () => {});` });
    expect(classify(root, ['e2e/a.spec.ts']).get(path.join(root, 'e2e/a.spec.ts'))?.[0]).toMatch(/annotated e2e-exclusive: counts rows/);
  });
  it('an annotation without a reason still counts, and says so (fail closed)', () => {
    const root = fixture({ 'e2e/a.spec.ts': `// e2e-exclusive:\ntest('x', () => {});` });
    expect(classify(root, ['e2e/a.spec.ts']).get(path.join(root, 'e2e/a.spec.ts'))?.[0]).toMatch(/no reason given/);
  });
  it('an annotation in a helper makes every spec importing it exclusive', () => {
    const root = fixture({
      'e2e/helpers/h.ts': `// e2e-exclusive: reads a global counter\nexport const h = 1;`,
      'e2e/a.spec.ts': `import { h } from './helpers/h'; test('x', () => { void h; });`,
    });
    expect(classify(root, ['e2e/a.spec.ts']).get(path.join(root, 'e2e/a.spec.ts'))?.[0]).toMatch(/via e2e\/helpers\/h\.ts.*reads a global counter/);
  });
  it('documentation that shows the form with a placeholder, or mentions it mid-line, does not annotate itself (gate 7d)', () => {
    const root = fixture({
      'e2e/a.spec.ts': `// e2e-exclusive: <reason>\n/* a line starting // e2e-exclusive: why */\nconst s = 'x // e2e-exclusive: not at line start';\ntest('x', () => {});`,
    });
    expect([...classify(root, ['e2e/a.spec.ts']).keys()]).toEqual([]);
  });
  it('on the REAL spec: p1083-ready-distribution is exclusive because of its annotation, and not without it', () => {
    const real = path.resolve('e2e/p1083-ready-distribution.spec.ts');
    const names = deriveServerWideNames(path.resolve('supabase/migrations'));
    expect(classifyFiles([real], { repoDir: path.resolve('.'), names }).get(real)?.[0]).toMatch(/annotated e2e-exclusive: counts the rows of ready_submissions/);
    // The control is built from the real file: the same text with the annotation line removed.
    const root = fixture({
      'e2e/p1083-ready-distribution.spec.ts': fs.readFileSync(real, 'utf8').replace(/^\/\/ e2e-exclusive:.*$/m, ''),
    });
    fs.cpSync(path.resolve('e2e/helpers'), path.join(root, 'e2e/helpers'), { recursive: true }); // the real helpers it imports
    expect([...classify(root, ['e2e/p1083-ready-distribution.spec.ts']).keys()]).toEqual([]);
  });
  it('the clock-derived fixture name in p1314c is gone: random, not Date.now', () => {
    const text = fs.readFileSync(path.resolve('e2e/integration/p1314c-release-requires-seat-secret.spec.ts'), 'utf8');
    const def = /const fixtureCode = [\s\S]*?;\n/.exec(text)?.[0] ?? '';
    expect(def).toMatch(/randomInt/);
    expect(def).not.toMatch(/Date\.now/);
    expect(/const fixtureCode = \(\) => `Q\$\{Date\.now\(\)\.toString\(\)\.slice\(-5\)\}`;/.test('const fixtureCode = () => `Q${Date.now().toString().slice(-5)}`;\n')).toBe(true); // the old form this check is aimed at
  });
});

describe('the parser reads the write\'s own call chain (review: a later statement never excuses a write)', () => {
  const flagged = (files: Record<string, string>) => { const root = fixture(files); return classify(root, Object.keys(files)).size; };
  it('failing controls: a filter in a LATER statement, a WHERE in ANOTHER SQL statement, a builder held in a const', () => {
    expect(flagged({ 'e2e/a.spec.ts': `const q = supabaseAdmin.from('per_user_things').delete();\nawait q.eq('id', 1);` })).toBe(1);
    expect(flagged({ 'e2e/a.spec.ts': 'await testDbSql(`DELETE FROM per_user_things; SELECT 1 WHERE true`);' })).toBe(1);
    expect(flagged({ 'e2e/a.spec.ts': `const b = supabaseAdmin.from('per_user_things');\nawait b.delete();` })).toBe(1);
  });
  it('the same writes with the filter IN their own chain / statement stay parallel (legitimate inputs)', () => {
    expect(flagged({ 'e2e/a.spec.ts': `await supabaseAdmin.from('per_user_things').delete().eq('id', 1);\nawait supabaseAdmin.from('per_user_things')\n  .update({ x: 1 })\n  .in('id', ids);` })).toBe(0);
    expect(flagged({ 'e2e/a.spec.ts': 'await testDbSql(`DELETE FROM per_user_things WHERE id = 1; SELECT 1`);' })).toBe(0);
    expect(flagged({ 'e2e/a.spec.ts': `const b = supabaseAdmin.from('per_user_things');\nawait b.delete().eq('id', 1);` })).toBe(0);
  });
  it('a Map or Set delete is not a database write', () => {
    expect(flagged({ 'e2e/a.spec.ts': `const m = new Map<string, number>(); m.delete('x'); const s = new Set<number>(); s.delete(1);` })).toBe(0);
  });
  it('a query or table held in a constant, or joined from pieces, is seen', () => {
    expect(flagged({ 'e2e/a.spec.ts': 'const q = `DELETE FROM per_user_things`;\nawait testDbSql(q);' })).toBe(1);
    expect(flagged({ 'e2e/a.spec.ts': `const T = 'kill_switch';\nawait supabaseAdmin.from(T).update({ enabled: true }).eq('singleton', true);` })).toBe(1);
    expect(flagged({ 'e2e/a.spec.ts': `await testDbSql('DELETE ' + 'FROM per_user_things');` })).toBe(1);
    expect(flagged({ 'e2e/a.spec.ts': 'const name = pick();\nawait testDbSql(`DELETE FROM ${name}`);' })).toBe(1);
  });
  it('what stays unseen is listed, not hidden: lower-case SQL is NOT flagged today', () => {
    expect(flagged({ 'e2e/a.spec.ts': 'await testDbSql(`delete from per_user_things`);' })).toBe(0);
  });
});

describe('fail closed: when the scan cannot be sure, the spec is server-wide', () => {
  it('an import that resolves to no file', () => {
    const root = fixture({ 'e2e/a.spec.ts': `import { x } from './helpers/missing';\ntest('t', () => { void x; });` });
    expect(classify(root, ['e2e/a.spec.ts']).get(path.join(root, 'e2e/a.spec.ts'))?.[0]).toMatch(/resolves to no file/);
  });
  it('a file that cannot be read', () => {
    const root = fixture({});
    expect(classify(root, ['e2e/nope.spec.ts']).get(path.join(root, 'e2e/nope.spec.ts'))?.[0]).toMatch(/could not be read/);
  });
  it('a helper that cannot be resolved makes the importing spec server-wide, with the helper named', () => {
    const root = fixture({ 'e2e/helpers/h.ts': `import './gone';\nexport const h = 1;`, 'e2e/a.spec.ts': `import { h } from './helpers/h'; test('t', () => { void h; });` });
    expect(classify(root, ['e2e/a.spec.ts']).get(path.join(root, 'e2e/a.spec.ts'))?.[0]).toMatch(/via e2e\/helpers\/h\.ts.*resolves to no file/);
  });
  it('migrations that cannot be read, are missing, or yield nothing: every spec is server-wide', () => {
    const root = fixture({ 'e2e/a.spec.ts': `test('t', () => {});` });
    fs.rmSync(path.join(root, 'supabase/migrations/20260101000000_x.sql'));
    expect(classify(root, ['e2e/a.spec.ts']).get(path.join(root, 'e2e/a.spec.ts'))?.[0]).toMatch(/names could not be derived.*no migrations/);
    fs.writeFileSync(path.join(root, 'supabase/migrations/20260101000000_x.sql'), '-- nothing\nSELECT 1;');
    expect(classify(root, ['e2e/a.spec.ts']).get(path.join(root, 'e2e/a.spec.ts'))?.[0]).toMatch(/yielded no singleton/);
    fs.rmSync(path.join(root, 'supabase/migrations'), { recursive: true });
    expect(classify(root, ['e2e/a.spec.ts']).get(path.join(root, 'e2e/a.spec.ts'))?.[0]).toMatch(/cannot read/);
  });
  it('on the REAL tree: no spec is flagged for an unresolved import or an unreadable file today', () => {
    const reasons = [...allServerWideSpecs({ repoDir: path.resolve('.') }).values()].flat();
    expect(reasons.filter(r => /resolves to no file|could not be read|could not be derived/.test(r))).toEqual([]);
  });
});

describe('argv forms (review): flags before `test`, value flags, and no subcommand at all', () => {
  const repoDir = path.resolve('.');
  it('value flags and their values stay together in the listing', () => {
    const r = detectForArgv({ repoDir, argv: ['test', '-c', 'playwright.config.ts', '--workers', '3', '-g', 'Logo', 'e2e/logo-navigation.spec.ts'], env: {} });
    expect(r.error).toBeNull();
    expect(r.exclusive).toBe(false);
    expect(r.files.map((f: string) => path.relative(repoDir, f))).toEqual(['e2e/logo-navigation.spec.ts']);
  }, 60_000);
  it('failing control: a listing that cannot run (unknown config) is exclusive, and so is an argv with no `test`', () => {
    const bad = detectForArgv({ repoDir, argv: ['-c', 'no-such.config.ts', 'test', 'e2e/logo-navigation.spec.ts'], env: {} });
    expect(bad.exclusive).toBe(true);
    expect(bad.error).toBeTruthy();
    const none = detectForArgv({ repoDir, argv: ['--help'], env: {} });
    expect(none.exclusive).toBe(true);
    expect(none.error).toMatch(/no `test` subcommand/);
  }, 60_000);
  it('forced or failed detection reports every server-wide spec in the tree (a safe superset)', () => {
    const forced = detectServerWide({ repoDir, args: ['e2e/logo-navigation.spec.ts'], env: { E2E_SELFHOSTED_EXCLUSIVE: '1' } });
    expect(forced.unknown).toBe(true);
    expect(forced.serverWideFiles.map((f: string) => path.relative(repoDir, f))).toEqual(expect.arrayContaining(['e2e/p1592-event-transcripts.spec.ts', 'e2e/p1083-ready-distribution.spec.ts']));
  }, 60_000);
});

describe('which specs a run covers is resolved by Playwright itself', () => {
  // P1642: the listing imports every spec, so the child needs a database setting that does not come from a
  // gitignored .env.test.local (CI has none).
  const hermetic = withHermeticE2eEnv();
  it('a directory, a file and a project argument resolve through the config project rules', () => {
    const one = listRunSpecs({ repoDir: path.resolve('.'), args: ['e2e/logo-navigation.spec.ts'], env: hermetic });
    expect(one.error).toBeNull();
    expect(one.files.map((f: string) => path.relative(path.resolve('.'), f))).toEqual(['e2e/logo-navigation.spec.ts']);
    const proj = listRunSpecs({ repoDir: path.resolve('.'), args: ['--project=integration', 'p1307-sweep'], env: hermetic });
    expect(proj.files.every((f: string) => f.includes('/e2e/integration/'))).toBe(true);
    expect(proj.files.length).toBeGreaterThan(0);
  }, 60_000);

  it('the documented way to read results (--reporter=json with PLAYWRIGHT_JSON_OUTPUT_NAME) does not break the listing or overwrite the report file', () => {
    const sentinel = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'p1607j-')), 'report.json');
    dirs.push(path.dirname(sentinel));
    fs.writeFileSync(sentinel, 'SENTINEL');
    const env = { ...hermetic, PLAYWRIGHT_JSON_OUTPUT_NAME: sentinel, PLAYWRIGHT_JSON_OUTPUT_DIR: path.dirname(sentinel) };
    const r = listRunSpecs({ repoDir: path.resolve('.'), args: ['--reporter=json', 'e2e/logo-navigation.spec.ts'], env });
    expect(r.error).toBeNull();
    expect(r.files.length).toBe(1);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('SENTINEL');
    expect(detectServerWide({ repoDir: path.resolve('.'), args: ['--reporter=json', 'e2e/logo-navigation.spec.ts'], env }).exclusive).toBe(false);
  }, 60_000);

  it('a run whose listing fails is treated as exclusive (fail closed), not as safe', () => {
    const bad = listRunSpecs({ repoDir: path.resolve('.'), args: ['--project=does-not-exist'], env: hermetic });
    expect(bad.error).toBeTruthy();
    expect(detectServerWide({ repoDir: path.resolve('.'), args: ['--project=does-not-exist'], env: hermetic }).exclusive).toBe(true);
  }, 60_000);

  it('end to end: a kill-switch spec makes the run exclusive, an ordinary one does not, a full suite is exclusive', () => {
    const repoDir = path.resolve('.');
    const sw = detectServerWide({ repoDir, args: ['e2e/p1592-event-transcripts.spec.ts'], env: hermetic });
    expect(sw.exclusive).toBe(true);
    expect(sw.serverWideFiles.map((f: string) => path.relative(repoDir, f))).toEqual(['e2e/p1592-event-transcripts.spec.ts']);
    const plain = detectServerWide({ repoDir, args: ['e2e/logo-navigation.spec.ts'], env: hermetic });
    expect(plain.exclusive).toBe(false);
    expect(plain.serverWideFiles).toEqual([]);
    expect(detectServerWide({ repoDir, args: [], env: hermetic }).exclusive).toBe(true);
  }, 90_000);

  it('E2E_SELFHOSTED_EXCLUSIVE=1 forces a run to be exclusive', () => {
    const r = detectServerWide({ repoDir: path.resolve('.'), args: ['e2e/logo-navigation.spec.ts'], env: { E2E_SELFHOSTED_EXCLUSIVE: '1' } });
    expect(r.exclusive).toBe(true);
  }, 60_000);
});
