/**
 * @file p1364-cache-invalidation-drift-guard.test.ts
 * @description P1364 reviews 3–4 — every client write that can change a cached /feed or /stake
 * row (or a card's link map) must clear the list-return cache, AFTER the write. Otherwise Back
 * serves the list from BEFORE the reader's own write.
 *
 * What counts as a write is DERIVED, never hand-listed (review 4: the hand list missed
 * submit_rating_by_token):
 *   - SQL (supabase/migrations, replayed in order — CREATE/DROP FUNCTION, CREATE/DROP TRIGGER):
 *     a function "writes" if its latest dollar-quoted body INSERTs/UPDATEs/DELETEs a cached
 *     table, writes a table whose trigger runs a writer, or calls a writer — to a fixpoint.
 *     The cached tables are extended the same way: any table with a writer trigger.
 *   - Edge functions (supabase/functions/<name>, plus the relative files they import): a write
 *     chain on a cached table, or an `.rpc()` of a writer.
 *   - Client (src/app + src/lib, TypeScript AST): `.from('<cached>')…insert|upsert|update|delete`,
 *     `.rpc('<writer>')`, `.functions.invoke('<writing edge fn>')`, or a
 *     `/functions/v1/<writing edge fn>` URL.
 *
 * A write is covered when (review 4) a `clearListReturnCache()` runs AFTER it: a statement-level
 * call later in the same block or in an enclosing block of the same function, or a call in the
 * `finally` of a try that encloses it — or when it sits in a service method listed in the
 * `withListReturnCacheInvalidation(...)` wrapper (read from points-service.ts /
 * stories-service.ts). A clear before the write, or in a branch that does not enclose it, does
 * not count.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import ts from 'typescript';

/** Tables whose rows (or counts) the cached lists render. story_verifications → understoodCount. */
const BASE_CACHED_TABLES = ['point_positions', 'points', 'stories', 'story_points', 'story_verifications'];
const WRITE_METHODS = new Set(['insert', 'upsert', 'update', 'delete']);

/** Named exceptions: `file#function` → why no invalidation is needed. Keep it small. */
const ALLOWLIST: Record<string, string> = {};

// ─── Derivation from the database and edge-function sources ──────────────────

interface Derived { tables: Set<string>; rpcs: Set<string>; edgeFunctions: Set<string> }

function deriveWriters(root: string): Derived {
  const migDir = join(root, 'supabase', 'migrations');
  const files = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
  const defs = new Map<string, string>();
  const triggers = new Map<string, { table: string; fn: string }>();
  const FN = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\(/gi;
  const TR = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?(\w+)"?\s+[\s\S]*?\bON\s+(?:public\.)?"?(\w+)"?[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?"?(\w+)"?/gi;
  const DT = /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+(?:public\.)?"?(\w+)"?/gi;
  const DF = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?(\w+)"?/gi;
  for (const f of files) {
    const sql = readFileSync(join(migDir, f), 'utf8').replace(/--[^\n]*/g, '');
    const events: Array<[number, () => void]> = [];
    for (const m of sql.matchAll(FN)) {
      const rest = sql.slice(m.index! + m[0].length);
      const tag = rest.match(/\bAS\s+(\$[A-Za-z_]*\$)/i);
      if (!tag) continue;
      const start = tag.index! + tag[0].length;
      const end = rest.indexOf(tag[1]!, start);
      const body = rest.slice(start, end > 0 ? end : undefined);
      events.push([m.index!, () => defs.set(m[1]!, body)]);
    }
    for (const m of sql.matchAll(TR)) events.push([m.index!, () => triggers.set(`${m[1]}@${m[2]!.toLowerCase()}`, { table: m[2]!.toLowerCase(), fn: m[3]! })]);
    for (const m of sql.matchAll(DT)) events.push([m.index!, () => triggers.delete(`${m[1]}@${m[2]!.toLowerCase()}`)]);
    for (const m of sql.matchAll(DF)) events.push([m.index!, () => defs.delete(m[1]!)]);
    events.sort((a, b) => a[0] - b[0]).forEach(([, apply]) => apply());
  }
  const W = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?(?:public\.)?"?(\w+)"?/gi;
  const writes = new Map([...defs].map(([n, b]) => [n, new Set([...b.matchAll(W)].map(m => m[1]!.toLowerCase()))]));
  const triggersOn = new Map<string, Set<string>>();
  for (const { table, fn } of triggers.values()) triggersOn.set(table, (triggersOn.get(table) ?? new Set()).add(fn));

  const cached = new Set(BASE_CACHED_TABLES);
  const writers = new Set([...writes].filter(([, t]) => [...t].some(x => cached.has(x))).map(([n]) => n));
  for (let changed = true; changed;) {
    changed = false;
    for (const [n, body] of defs) {
      if (writers.has(n)) continue;
      const viaTrigger = [...writes.get(n)!].some(t => [...(triggersOn.get(t) ?? [])].some(fn => writers.has(fn)));
      const viaCall = [...writers].some(w => new RegExp(`\\b${w}\\s*\\(`).test(body));
      if (viaTrigger || viaCall) { writers.add(n); changed = true; }
    }
  }
  const tables = new Set([...cached, ...[...triggersOn].filter(([, fns]) => [...fns].some(f => writers.has(f))).map(([t]) => t)]);

  const fnRoot = join(root, 'supabase', 'functions');
  const edgeFunctions = new Set<string>();
  for (const name of readdirSync(fnRoot)) {
    const dir = join(fnRoot, name);
    if (name.startsWith('_') || !statSync(dir).isDirectory()) continue;
    const queue = listTs(dir);
    const seen = new Set(queue);
    for (let i = 0; i < queue.length; i++) {
      for (const m of readFileSync(queue[i]!, 'utf8').matchAll(/from\s+['"](\.\.?\/[^'"]+\.ts)['"]/g)) {
        const p = normalize(join(dirname(queue[i]!), m[1]!));
        if (existsSync(p) && !seen.has(p)) { seen.add(p); queue.push(p); }
      }
    }
    const src = queue.map(f => readFileSync(f, 'utf8')).join('\n');
    const chainWrite = [...src.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)].some(m =>
      tables.has(m[1]!) && /^(?:\s|\/\/[^\n]*|\.\w+\((?:[^()]|\([^()]*\))*\))*?\.(?:insert|upsert|update|delete)\(/s.test(src.slice(m.index! + m[0].length, m.index! + m[0].length + 600)));
    const rpcWrite = [...src.matchAll(/\.rpc\(\s*['"](\w+)['"]/g)].some(m => writers.has(m[1]!));
    if (chainWrite || rpcWrite) edgeFunctions.add(name);
  }
  return { tables, rpcs: writers, edgeFunctions };
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTs(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

// ─── Client scan ──────────────────────────────────────────────────────────────

interface Write { file: string; line: number; fn: string; what: string; covered: boolean }

function wrappedMethods(root: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const pairs: Array<[string, string]> = [['points-service.ts', 'points-service-real.ts'], ['stories-service.ts', 'stories-service-real.ts']];
  for (const [service, impl] of pairs) {
    const src = readFileSync(join(root, 'src/app/data', service), 'utf8');
    const m = src.match(/withListReturnCacheInvalidation\([\s\S]*?\[([\s\S]*?)\]\s*,?\s*\)/);
    const names = new Set((m?.[1] ?? '').match(/'([A-Za-z]+)'/g)?.map(s => s.slice(1, -1)) ?? []);
    out.set(`src/app/data/${impl}`, names);
  }
  return out;
}

function enclosingNamedFunction(node: ts.Node, sf: ts.SourceFile): { name: string; node: ts.Node } {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) return { name: p.name.getText(sf), node: p };
    if (ts.isVariableDeclaration(p) && p.initializer && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))) {
      return { name: p.name.getText(sf), node: p };
    }
    if (ts.isPropertyAssignment(p) && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))) {
      return { name: p.name.getText(sf), node: p };
    }
  }
  return { name: '<module>', node: sf };
}

function isAncestor(a: ts.Node, n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n; p; p = p.parent) if (p === a) return true;
  return false;
}

/** Does a clearListReturnCache() in `scope` run after `write`? (See the file header.) */
function clearedAfter(write: ts.Node, scope: ts.Node): boolean {
  const clears: ts.CallExpression[] = [];
  const collect = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'clearListReturnCache') clears.push(n);
    ts.forEachChild(n, collect);
  };
  collect(scope);
  return clears.some(c => {
    for (let p: ts.Node | undefined = write.parent; p && p !== scope.parent; p = p.parent) {
      if (ts.isTryStatement(p) && p.finallyBlock && isAncestor(p.tryBlock, write) && isAncestor(p.finallyBlock, c)) return true;
    }
    const stmt = c.parent;
    if (!ts.isExpressionStatement(stmt)) return false;
    const block = stmt.parent;
    if (!(ts.isBlock(block) || ts.isSourceFile(block))) return false;
    return isAncestor(block, write) && c.getStart() >= write.getEnd() && !exitsBetween(scope, write.getEnd(), c.getStart());
  });
}

/** A `return` or `throw` of this function between the write and the clear skips the clear on
 *  some path (Codex review, round 4). Conservative: any exit in that span counts; nested
 *  functions are not this function's exits. */
function exitsBetween(scope: ts.Node, from: number, to: number): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (n !== scope && ts.isFunctionLike(n)) return;
    if ((ts.isReturnStatement(n) || ts.isThrowStatement(n)) && n.getStart() >= from && n.getEnd() <= to) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(scope, visit);
  return found;
}

function tableOfChain(call: ts.CallExpression): string | null {
  let r: ts.Expression = (call.expression as ts.PropertyAccessExpression).expression;
  while (ts.isCallExpression(r) && ts.isPropertyAccessExpression(r.expression)) {
    if (r.expression.name.text === 'from') {
      const [arg] = r.arguments;
      return arg && ts.isStringLiteral(arg) ? arg.text : null;
    }
    r = r.expression.expression;
  }
  return null;
}

function findWrites(file: string, source: string, d: Derived): Write[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Write[] = [];
  const push = (node: ts.Node, what: string) => {
    const fn = enclosingNamedFunction(node, sf);
    found.push({
      file,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      fn: fn.name,
      what,
      covered: clearedAfter(node, fn.node),
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const [arg] = node.arguments;
      if (WRITE_METHODS.has(method)) {
        const table = tableOfChain(node);
        if (table && d.tables.has(table)) push(node, `${table}.${method}`);
      }
      if (method === 'rpc' && arg && ts.isStringLiteral(arg) && d.rpcs.has(arg.text)) push(node, `rpc ${arg.text}`);
      if (method === 'invoke' && arg && ts.isStringLiteral(arg) && d.edgeFunctions.has(arg.text)) push(node, `edge ${arg.text}`);
    }
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
      const text = node.getText(sf);
      for (const fnName of d.edgeFunctions) if (text.includes(`/functions/v1/${fnName}`)) push(node, `edge ${fnName} (fetch)`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function violations(writes: Write[], wrapped: Map<string, Set<string>>): string[] {
  return writes
    .filter(w => !w.covered && !wrapped.get(w.file)?.has(w.fn) && !ALLOWLIST[`${w.file}#${w.fn}`])
    .map(w => `${w.file}:${w.line} ${w.fn}() ${w.what}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const root = process.cwd();
const derived = deriveWriters(root);

describe('P1364 cache-invalidation drift guard — the derivation', () => {
  it('finds the known writers from the migrations and edge functions (it is not blind)', () => {
    for (const rpc of ['submit_point_response_by_token', 'replay_letter_positions', 'erase_my_account', 'submit_rating_by_token']) {
      expect(derived.rpcs, rpc).toContain(rpc);
    }
    expect(derived.edgeFunctions).toContain('confirm-letter-response');
    for (const t of BASE_CACHED_TABLES) expect(derived.tables).toContain(t);
  });

  it('does not count a function whose migration DROPPED it, nor a trigger that only reassigns NEW', () => {
    expect(derived.rpcs).not.toContain('cascade_position_removal_to_story_points'); // dropped in P576
    expect(derived.rpcs).not.toContain('protect_system_tags'); // NEW.system_tags := OLD…, no write
  });
});

describe('P1364 cache-invalidation drift guard — the detector itself (controls)', () => {
  const none = new Map<string, Set<string>>();
  const d: Derived = {
    tables: new Set(BASE_CACHED_TABLES),
    rpcs: new Set(['replay_letter_positions']),
    edgeFunctions: new Set(['confirm-letter-response']),
  };
  const bad = (src: string) => violations(findWrites('x.ts', src, d), none);

  it('flags a direct write, a writing RPC and a writing edge function with no clear (known bad)', () => {
    expect(bad(`
      export async function a() { await supabase.from('point_positions').upsert({}).select(); }
      export const b = async () => { await supabase.from('stories').update({ x: 1 }).eq('id', 1); };
      export async function c() { await supabase.rpc('replay_letter_positions'); }
      export async function d() { await supabase.functions.invoke('confirm-letter-response', {}); }
      export async function e() { await fetch(\`\${url}/functions/v1/confirm-letter-response\`); }
    `)).toHaveLength(5);
  });

  it('flags a clear placed BEFORE the write (known bad)', () => {
    expect(bad(`export async function a() { clearListReturnCache(); await supabase.from('stories').update({}); }`)).toHaveLength(1);
  });

  it('flags a clear in an unrelated conditional branch (known bad)', () => {
    expect(bad(`export async function a(x: boolean) {
      if (x) { await supabase.from('point_positions').delete().eq('id', 1); }
      else { clearListReturnCache(); }
    }`)).toHaveLength(1);
    expect(bad(`export async function b(x: boolean) {
      await supabase.from('point_positions').delete().eq('id', 1);
      if (x) clearListReturnCache();
    }`)).toHaveLength(1);
  });

  it('flags a return or throw between the write and the clear (known bad, Codex round 4)', () => {
    expect(bad(`export async function a(x: boolean) {
      await supabase.from('stories').update({});
      if (x) return;
      clearListReturnCache();
    }`)).toHaveLength(1);
    expect(bad(`export async function b(x: boolean) {
      await supabase.from('point_positions').upsert({});
      if (x) throw new Error('x');
      clearListReturnCache();
    }`)).toHaveLength(1);
    // A return inside a nested callback is not this function's exit.
    expect(bad(`export async function c(xs: number[]) {
      await supabase.from('stories').update({});
      xs.forEach(x => { if (x) return; });
      clearListReturnCache();
    }`)).toEqual([]);
  });

  it('passes a clear after the write, in an enclosing block, or in an enclosing finally (known good)', () => {
    expect(bad(`
      export async function a() { await supabase.from('point_positions').upsert({}); clearListReturnCache(); }
      export async function b(x: boolean) { if (x) { await supabase.from('stories').update({}); } clearListReturnCache(); }
      export async function c() { try { await supabase.rpc('replay_letter_positions'); } finally { clearListReturnCache(); } }
      export async function d() { return supabase.from('stories').select('*').eq('id', 1); }
      export async function e() { await supabase.from('letters').insert({}); }
      export async function f() { await supabase.rpc('get_letter_results'); }
    `)).toEqual([]);
  });

  it('a method listed in the service wrapper counts as covered; an unlisted one does not', () => {
    const src = `export const svc = {
      async setPosition() { await supabase.from('point_positions').upsert({}); },
      async sneaky() { await supabase.from('point_positions').delete().eq('id', 1); },
    };`;
    const wrapped = new Map([['svc.ts', new Set(['setPosition'])]]);
    expect(violations(findWrites('svc.ts', src, d), wrapped)).toEqual(['svc.ts:3 sneaky() point_positions.delete']);
  });
});

describe('P1364 cache-invalidation drift guard — src/app and src/lib', () => {
  const files = [...listTs(join(root, 'src', 'app')), ...listTs(join(root, 'src', 'lib'))]
    .map(f => relative(root, f).split(sep).join('/'));
  const writes = files.flatMap(f => findWrites(f, readFileSync(join(root, f), 'utf8'), derived));
  const wrapped = wrappedMethods(root);

  it('the scan sees the known writers (it is not blind)', () => {
    const where = new Set(writes.map(w => w.file));
    expect(where).toContain('src/app/data/points-service-real.ts');
    expect(where).toContain('src/app/data/stories-service-real.ts');
    expect(where).toContain('src/app/data/letters-service.ts');
    expect(writes.some(w => w.what === 'rpc submit_rating_by_token')).toBe(true);
    expect(wrapped.get('src/app/data/points-service-real.ts')).toContain('setPosition');
  });

  it('every write to a cached table clears the list-return cache after it', () => {
    expect(violations(writes, wrapped), 'Call clearListReturnCache() after the write, or route it through the wrapped service').toEqual([]);
  });

  it('nothing but the two wrapper modules imports the UNWRAPPED services (the wrapper cannot be bypassed)', () => {
    const importers = files.filter(f => {
      if (f === 'src/app/data/points-service.ts' || f === 'src/app/data/stories-service.ts') return false;
      return /import[^;]*\b(realPointsService|realStoriesService|mockPointsService|mockStoriesService)\b/.test(readFileSync(join(root, f), 'utf8'));
    });
    expect(importers).toEqual([]);
  });

  it('every allowlist entry still exists', () => {
    for (const key of Object.keys(ALLOWLIST)) {
      expect(writes.some(w => `${w.file}#${w.fn}` === key), `${key} is allowlisted but no longer writes`).toBe(true);
    }
  });
});
