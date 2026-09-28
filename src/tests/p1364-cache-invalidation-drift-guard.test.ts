/**
 * @file p1364-cache-invalidation-drift-guard.test.ts
 * @description P1364 review 3 — every client write that can change a cached /feed or /stake row
 * (or a card's link map) must clear the list-return cache. Otherwise Back serves the list from
 * BEFORE the reader's own write.
 *
 * Found statically, through the TypeScript AST, in src/app and src/lib:
 *   - a Supabase chain `.from('<table>')…insert|upsert|update|delete(…)` on a CACHED table;
 *   - `.rpc('<name>')` for an RPC whose SQL body writes a cached table (audited from
 *     supabase/migrations — see WRITING_RPCS);
 *   - `.functions.invoke('<name>')` / a fetch to `/functions/v1/<name>` for an edge function that
 *     writes a cached table (audited from supabase/functions — see WRITING_EDGE_FUNCTIONS).
 * Each write must sit in a named function that either calls `clearListReturnCache()` itself, or
 * is a service method listed in the `withListReturnCacheInvalidation(...)` wrapper of
 * points-service.ts / stories-service.ts (read from those files, so the list cannot drift).
 *
 * The controls block runs the detector on known-bad and known-good snippets first.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/** Tables whose rows (or counts) the cached lists render. story_verifications → understoodCount. */
const CACHED_TABLES = new Set(['point_positions', 'points', 'stories', 'story_points', 'story_verifications']);
const WRITE_METHODS = new Set(['insert', 'upsert', 'update', 'delete']);
/** RPCs whose latest definition writes a cached table (audit 2026-09-28). */
const WRITING_RPCS = new Set(['submit_point_response_by_token', 'replay_letter_positions', 'erase_my_account']);
/** Edge functions that write a cached table (audit 2026-09-28). */
const WRITING_EDGE_FUNCTIONS = new Set(['confirm-letter-response']);

/** Named exceptions: `file#function` → why no invalidation is needed. Keep it small. */
const ALLOWLIST: Record<string, string> = {};

interface Write { file: string; line: number; fn: string; what: string; clears: boolean }

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

function enclosingNamedFunction(node: ts.Node, sf: ts.SourceFile): { name: string; body: string } {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) {
      return { name: p.name.getText(sf), body: p.getText(sf) };
    }
    if (ts.isVariableDeclaration(p) && p.initializer && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))) {
      return { name: p.name.getText(sf), body: p.getText(sf) };
    }
    if (ts.isPropertyAssignment(p) && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))) {
      return { name: p.name.getText(sf), body: p.getText(sf) };
    }
  }
  return { name: '<module>', body: sf.getText() };
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

function findWrites(file: string, source: string): Write[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Write[] = [];
  const push = (node: ts.Node, what: string) => {
    const fn = enclosingNamedFunction(node, sf);
    found.push({
      file,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      fn: fn.name,
      what,
      clears: /\bclearListReturnCache\(/.test(fn.body),
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const [arg] = node.arguments;
      if (WRITE_METHODS.has(method)) {
        const table = tableOfChain(node);
        if (table && CACHED_TABLES.has(table)) push(node, `${table}.${method}`);
      }
      if (method === 'rpc' && arg && ts.isStringLiteral(arg) && WRITING_RPCS.has(arg.text)) push(node, `rpc ${arg.text}`);
      if (method === 'invoke' && arg && ts.isStringLiteral(arg) && WRITING_EDGE_FUNCTIONS.has(arg.text)) push(node, `edge ${arg.text}`);
    }
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
      const text = node.getText(sf);
      for (const fnName of WRITING_EDGE_FUNCTIONS) {
        if (text.includes(`/functions/v1/${fnName}`)) push(node, `edge ${fnName} (fetch)`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function violations(writes: Write[], wrapped: Map<string, Set<string>>): string[] {
  return writes
    .filter(w => !w.clears && !wrapped.get(w.file)?.has(w.fn) && !ALLOWLIST[`${w.file}#${w.fn}`])
    .map(w => `${w.file}:${w.line} ${w.fn}() ${w.what}`);
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('P1364 cache-invalidation drift guard — the detector itself (controls)', () => {
  const none = new Map<string, Set<string>>();
  it('flags a direct write, a writing RPC and a writing edge function with no clear (known bad)', () => {
    const src = `
      export async function a() { await supabase.from('point_positions').upsert({}).select(); }
      export const b = async () => { await supabase.from('stories').update({ x: 1 }).eq('id', 1); };
      export async function c() { await supabase.rpc('replay_letter_positions'); }
      export async function d() { await supabase.functions.invoke('confirm-letter-response', {}); }
      export async function e() { await fetch(\`\${url}/functions/v1/confirm-letter-response\`); }
    `;
    expect(violations(findWrites('x.ts', src), none)).toHaveLength(5);
  });

  it('passes a write followed by a clear, reads, other tables and non-writing RPCs (known good)', () => {
    const src = `
      export async function a() { await supabase.from('point_positions').upsert({}); clearListReturnCache(); }
      export async function b() { return supabase.from('stories').select('*').eq('id', 1); }
      export async function c() { await supabase.from('letters').insert({}); }
      export async function d() { await supabase.rpc('get_letter_results'); }
    `;
    expect(violations(findWrites('x.ts', src), none)).toEqual([]);
  });

  it('a method listed in the service wrapper counts as covered; an unlisted one does not', () => {
    const src = `export const svc = {
      async setPosition() { await supabase.from('point_positions').upsert({}); },
      async sneaky() { await supabase.from('point_positions').delete().eq('id', 1); },
    };`;
    const wrapped = new Map([['svc.ts', new Set(['setPosition'])]]);
    expect(violations(findWrites('svc.ts', src), wrapped)).toEqual(['svc.ts:3 sneaky() point_positions.delete']);
  });
});

describe('P1364 cache-invalidation drift guard — src/app and src/lib', () => {
  const root = process.cwd();
  const files = [...listSourceFiles(join(root, 'src', 'app')), ...listSourceFiles(join(root, 'src', 'lib'))]
    .map(f => relative(root, f).split(sep).join('/'));
  const writes = files.flatMap(f => findWrites(f, readFileSync(join(root, f), 'utf8')));
  const wrapped = wrappedMethods(root);

  it('the scan sees the known writers (it is not blind)', () => {
    const where = new Set(writes.map(w => w.file));
    expect(where).toContain('src/app/data/points-service-real.ts');
    expect(where).toContain('src/app/data/stories-service-real.ts');
    expect(where).toContain('src/app/data/letters-service.ts');
    expect(wrapped.get('src/app/data/points-service-real.ts')).toContain('setPosition');
  });

  it('every write to a cached table clears the list-return cache', () => {
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
