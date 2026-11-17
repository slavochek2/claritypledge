/**
 * P1691 — the host of a mailed link comes from configuration, through one shared rule.
 *
 * `supabase/functions/_shared/link-base.ts` decides the base address of links in mail: the
 * configured app address, or a request origin that matches the exact development rule in
 * `_shared/cors.ts` on a project that is not prod. This file keeps every function on that one
 * rule: no function reads the request's `Origin` header itself, and no function tests an origin
 * with a prefix match.
 *
 * STRUCTURAL ONLY, and a tripwire rather than a proof: it reads source text for the two shapes
 * this defect had, and other ways of reading a request value would pass it. The behaviour is
 * proven in the Deno suites: `supabase/functions/_shared/link-base.test.ts`, and for each mail
 * function its `index.test.ts`, which sends requests through the function's real entry point.
 *
 * Scope is derived (every function directory, every non-test module in it), with the two mail
 * functions that build links from a request asserted present so a narrowed scan cannot pass.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { allFunctionSources } from './helpers/edge-function-source';

const FUNCTIONS = join(resolve(__dirname, '../..'), 'supabase/functions');
const SHARED = join(FUNCTIONS, '_shared');
const LINK_BUILDERS = ['send-letter-emails', 'send-agreement-emails'];
/** The only shared modules that may look at the request origin. */
const ORIGIN_READERS = ['cors.ts', 'link-base.ts'];

const READS_ORIGIN = /headers\s*\.\s*get\(\s*['"`]origin['"`]\s*\)/i;
const PREFIX_MATCH_ON_LOCALHOST = /startsWith\(\s*['"`]https?:\/\/localhost/i;

/** Reasons a module's source picks a link host on its own; empty when it does not. */
export function ownHostRules(src: string): string[] {
  const reasons: string[] = [];
  if (READS_ORIGIN.test(src)) reasons.push('reads the request Origin header itself');
  if (PREFIX_MATCH_ON_LOCALHOST.test(src)) reasons.push('tests an origin with a prefix match');
  return reasons;
}

const functions = allFunctionSources(FUNCTIONS);

describe('P1691: one rule decides the host of a mailed link', () => {
  it('derives the functions that build links from a request into scope', () => {
    const names = functions.map((f) => f.name);
    expect(names.length).toBeGreaterThan(LINK_BUILDERS.length);
    for (const name of LINK_BUILDERS) expect(names, `${name} missing from the derived scope`).toContain(name);
  });

  it('no function picks a link host on its own', () => {
    for (const { name, src } of functions) expect(ownHostRules(src), name).toEqual([]);
  });

  it('the functions that build links from a request use the shared rule', () => {
    for (const name of LINK_BUILDERS) {
      const src = functions.find((f) => f.name === name)?.src ?? '';
      expect(src, name).toContain("from '../_shared/link-base.ts'");
      expect(src, name).toContain('resolveLinkBase(');
    }
  });

  it('among shared modules, only the CORS helper and the link rule look at the request origin', () => {
    const readers = readdirSync(SHARED)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.test-util.ts'))
      .filter((f) => ownHostRules(readFileSync(join(SHARED, f), 'utf8')).length > 0)
      .sort();
    for (const reader of readers) expect(ORIGIN_READERS, `${reader} reads the request origin`).toContain(reader);
    // The matcher is not blind: it sees the one reader that has always existed.
    expect(readers).toContain('cors.ts');
  });

  it('the rule names no project: prod is recognised only through the one shared check', () => {
    const rule = readFileSync(join(SHARED, 'link-base.ts'), 'utf8');
    expect(rule).toContain("from './nonprod-image-guard.ts'");
    expect(rule).toContain('isProdProject(');
    // No project address of its own, so the one place that names prod stays the only one.
    expect(rule).not.toMatch(/[a-z0-9-]+\.supabase\.co/);
  });

  it('control: both shapes are caught, and reading another header is not', () => {
    expect(ownHostRules("const o = req.headers.get('origin');")).toHaveLength(1);
    expect(ownHostRules('const o = req.headers.get("Origin") ?? "";')).toHaveLength(1);
    expect(ownHostRules("if (o.startsWith('http://localhost')) use(o);")).toHaveLength(1);
    expect(ownHostRules("const a = req.headers.get('Authorization');")).toEqual([]);
    expect(ownHostRules('const base = resolveLinkBase(req, appUrl, supabaseUrl);')).toEqual([]);
  });
});
