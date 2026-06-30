/**
 * @file sd-guard-completeness.test.ts
 * @description Generalized P952-class canary. For every SECURITY DEFINER
 * function defined across supabase/migrations/, the most recent migration
 * that (re)defines it must still contain every guard clause that any earlier
 * version of the function ever had — RAISE EXCEPTION messages and
 * security-critical token patterns (p878_relationship_scope).
 *
 * Motivation: P952 (20260618120000) recreated seal_and_send_letter from a
 * pre-P914 base, silently dropping the relationship-scope gate P914 had added
 * to block an email-harvesting oracle (receiver_profile_id is caller-supplied
 * and the function is SECURITY DEFINER). No test caught the regression. P975
 * restored the gate. This canary prevents the same "CREATE-OR-REPLACE-from-an-
 * old-base drops a guard" class of regression for ALL SECURITY DEFINER functions
 * simultaneously, without hardcoding names.
 *
 * Guard extraction heuristics (per function body):
 *   1. RAISE EXCEPTION 'message' — the message string (with SQL '' unescaped to ')
 *      must persist in the latest definition. Any change to wording is a deliberate
 *      security decision that must be acknowledged via KNOWN_INTENTIONAL_REMOVALS.
 *   2. Token 'p878_relationship_scope' — the scope-check call must persist in any
 *      function that ever used it.
 *
 * Algorithm: iterate CREATE OR REPLACE FUNCTION occurrences (not SECURITY DEFINER
 * occurrences) to avoid false matches in SQL comments. Within 800 chars of the
 * function header, require SECURITY DEFINER to appear before AS $$.
 *
 * To prove this canary fires (epistemic gate 7): set TEST_MIGRATIONS_DIR to a copy
 * of supabase/migrations/ with a regression applied, then run:
 *   TEST_MIGRATIONS_DIR=/tmp/mig-regressed npx vitest run sd-guard-completeness
 *
 * Mirrors p975-letter-scope-gate.test.ts but iterates over every SECURITY DEFINER
 * function instead of hardcoding one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR =
  process.env.TEST_MIGRATIONS_DIR ??
  join(__dirname, '..', '..', 'supabase', 'migrations');

/**
 * Security-critical call-site tokens (beyond RAISE EXCEPTION). If any earlier
 * version of a SECURITY DEFINER function contained one of these, the latest must too.
 */
const CRITICAL_TOKENS: ReadonlyArray<string> = ['p878_relationship_scope'];

/**
 * Known intentional guard removals — guards that were deliberately dropped because
 * the security mechanism changed (not because the guard was forgotten). Each entry
 * MUST include a comment explaining why the removal is safe.
 *
 * Key format: "<functionName>:<unescapedMessage>" for RAISE EXCEPTION guards,
 *             "<functionName>:token:<tokenString>" for token guards.
 */
const KNOWN_INTENTIONAL_REMOVALS = new Set<string>([
  // P699 (20260413110000_p699_inbox_items_no_param.sql) changed get_inbox_items API:
  // removed the p_user_id parameter and replaced it with auth.uid() directly. The
  // IS DISTINCT FROM auth.uid() ownership check and its RAISE EXCEPTION became
  // structurally unnecessary — callers can no longer supply a user_id, so
  // impersonation via this RPC is impossible regardless of the guard.
  "get_inbox_items:Unauthorized: cannot query another user's inbox",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GuardKind = 'raise' | 'token';

interface GuardClause {
  kind: GuardKind;
  /** For 'raise': the RAISE EXCEPTION message (SQL '' unescaped to '). */
  value: string;
  /** Raw text as it appears in SQL (for body lookup). */
  rawValue: string;
  /** Migration file that first introduced this guard. */
  source: string;
}

interface FuncRecord {
  guards: GuardClause[];
  latestFile: string;
  latestBody: string;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract SECURITY DEFINER function bodies from migration SQL text.
 *
 * Strategy per CREATE OR REPLACE FUNCTION occurrence:
 *   1. In the next 800 chars (function signature area), check that SECURITY
 *      DEFINER appears before AS $$ (so it is part of the function's options,
 *      not a comment that happens to precede the next function definition).
 *   2. Extract body content between AS $$ and the following $$ terminator.
 *
 * Returns: Map of function name → body text.
 */
function extractFunctionBodies(content: string): Map<string, string> {
  const result = new Map<string, string>();

  const fnRe = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
  const sdRe = /\bSECURITY DEFINER\b/i;
  const asRe = /\bAS\s+\$\$/i;

  let fnMatch: RegExpExecArray | null;
  while ((fnMatch = fnRe.exec(content)) !== null) {
    const funcName = fnMatch[1];
    const sigWindow = content.slice(fnMatch.index, fnMatch.index + 800);

    const sdInSig = sdRe.exec(sigWindow);
    if (!sdInSig) continue;

    const asInSig = asRe.exec(sigWindow);
    if (!asInSig) continue;

    // SECURITY DEFINER must precede AS $$ — if it appears after, it is in
    // a different function and we should not associate this body with funcName.
    if (sdInSig.index > asInSig.index) continue;

    const bodyStart = fnMatch.index + asInSig.index + asInSig[0].length;
    const bodyEnd = content.indexOf('$$', bodyStart);
    if (bodyEnd === -1) continue;

    result.set(funcName, content.slice(bodyStart, bodyEnd));
  }

  return result;
}

/**
 * Extract guard clauses from a function body.
 *
 * Guards tracked:
 *   - RAISE EXCEPTION messages (SQL '' unescaped to ')
 *   - CRITICAL_TOKENS presence
 */
function extractGuards(body: string, sourceFile: string): GuardClause[] {
  const guards: GuardClause[] = [];

  // RAISE EXCEPTION 'message' — handles SQL-escaped '' and multi-line forms
  const raiseRe = /RAISE\s+EXCEPTION\s+'((?:[^']|'')*)'/gi;
  let m: RegExpExecArray | null;
  while ((m = raiseRe.exec(body)) !== null) {
    const rawValue = m[1]; // as in SQL ('' escaping intact)
    const value = rawValue.replace(/''/g, "'"); // unescape for readability / allowlist
    guards.push({ kind: 'raise', value, rawValue, source: sourceFile });
  }

  // Security-critical call-site tokens
  for (const token of CRITICAL_TOKENS) {
    if (body.includes(token)) {
      guards.push({ kind: 'token', value: token, rawValue: token, source: sourceFile });
    }
  }

  return guards;
}

// ---------------------------------------------------------------------------
// Migration scanner
// ---------------------------------------------------------------------------

function scanMigrations(): Map<string, FuncRecord> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic = chronological (migration files use datetime prefixes)

  const records = new Map<string, FuncRecord>();

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const bodies = extractFunctionBodies(content);

    for (const [funcName, body] of bodies) {
      if (!records.has(funcName)) {
        records.set(funcName, { guards: [], latestFile: file, latestBody: body });
      }

      const rec = records.get(funcName)!;

      // Accumulate new guards, deduplicating by kind + value
      for (const g of extractGuards(body, file)) {
        const key = `${g.kind}:${g.value}`;
        const seen = rec.guards.some((eg) => `${eg.kind}:${eg.value}` === key);
        if (!seen) rec.guards.push(g);
      }

      // Advance to the latest definition
      rec.latestFile = file;
      rec.latestBody = body;
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('P952-class: SECURITY DEFINER functions preserve all historical guard clauses', () => {
  it('every SECURITY DEFINER function retains every guard clause from all prior definitions', () => {
    const records = scanMigrations();

    expect(
      records.size,
      `No SECURITY DEFINER functions found in ${MIGRATIONS_DIR} — check path`,
    ).toBeGreaterThan(0);

    const failures: string[] = [];

    for (const [funcName, rec] of records) {
      for (const guard of rec.guards) {
        // Check known intentional removals allowlist
        const allowlistKey =
          guard.kind === 'raise'
            ? `${funcName}:${guard.value}`
            : `${funcName}:token:${guard.value}`;
        if (KNOWN_INTENTIONAL_REMOVALS.has(allowlistKey)) continue;

        // Check body for presence — use raw SQL form (with '' escaping) for matching
        const rawInBody =
          guard.kind === 'raise'
            ? rec.latestBody.includes(`'${guard.rawValue}'`)
            : rec.latestBody.includes(guard.value);

        if (!rawInBody) {
          const what =
            guard.kind === 'raise'
              ? `RAISE EXCEPTION '${guard.value}'`
              : `token '${guard.value}'`;
          failures.push(
            `  • ${funcName} (latest: ${rec.latestFile})\n` +
              `    missing guard first seen in ${guard.source}:\n` +
              `    ${what}\n` +
              `    → Either re-apply the guard, or add an entry to KNOWN_INTENTIONAL_REMOVALS.`,
          );
        }
      }
    }

    expect(
      failures.length,
      `SECURITY DEFINER guard regression(s) detected.\n` +
        `A function was redefined without preserving guard clauses from a prior version.\n` +
        `This is the P952 pattern: CREATE OR REPLACE from an older base silently drops guards.\n\n` +
        failures.join('\n\n'),
    ).toBe(0);
  });
});
