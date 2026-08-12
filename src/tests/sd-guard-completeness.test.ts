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
 *   3. CRITICAL_PREDICATES (P980) — function-scoped WHERE-whitelist / JOIN-scope /
 *      RETURN-gate substrings (whitespace-normalized) that must persist if any
 *      version had them. These are the RLS-equivalent guards that heuristics 1–2 are
 *      blind to (no RAISE, reuse local vars present post-drop). Pending-but-detected
 *      drops live in KNOWN_PENDING_FIXES (burned down as each restoration fix lands).
 *
 * Algorithm: iterate CREATE [OR REPLACE] FUNCTION occurrences (both forms — a
 * DROP FUNCTION; CREATE FUNCTION rewrite, e.g. P964, reads as a bare CREATE and an
 * OR-REPLACE-only scan would miss the dropped guard). Not SECURITY DEFINER
 * occurrences (avoids false matches in SQL comments). Within 800 chars of the
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

/**
 * Collapse all whitespace to single spaces so a guard predicate matches across
 * reformatting (newlines, indentation) between migration versions.
 */
function normalizeSql(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Function-scoped structural guards (beyond RAISE messages and CRITICAL_TOKENS):
 * RLS-equivalent WHERE-whitelists, JOIN-scopes, and RETURN-gate predicates that
 * have NO distinctive RAISE message and reuse local variable names present in the
 * post-drop body — so the RAISE/token heuristics are structurally blind to them.
 *
 * Rule: if ANY version of `fn` contained `needle` (whitespace-normalized), the
 * latest definition must too — else it is a P952-class silent scope drop.
 *
 * Each entry was added because a real regression slipped past the RAISE/token
 * canary (see the referenced P-number). Needles are matched as normalized
 * substrings, so keep them short and structurally distinctive.
 */
interface CriticalPredicate {
  fn: string;
  needle: string;
  note: string;
}
const CRITICAL_PREDICATES: ReadonlyArray<CriticalPredicate> = [
  {
    fn: 'get_letter_position_stories',
    needle: 'author_id IN (v_sender_id, v_receiver_id)',
    note: 'P977: two-participant author whitelist — without it, third-party-authored ' +
      'stories on a shared snapshot point leak to a letter participant (RLS bypassed).',
  },
  {
    fn: 'reveal_prediction_by_token',
    needle: 'letter_story_snapshots lss ON lss.story_id = sv.story_id',
    note: 'P978: per-listener sealed-bid delivery scope — without the snapshot join + ' +
      'listener_id match, any co-recipient rating unlocks the sender prediction reveal.',
  },
  {
    fn: 'update_delivery_status_by_token',
    needle: 'v_new_rank',
    note: 'P979: forward-only monotonic status guard — without the rank comparison a ' +
      'token holder can drive their delivery status backward.',
  },
  {
    // NEEDLE DELIBERATELY INCLUDES THE `IS NOT NULL` CONJUNCT. The shorter form
    // `v_row.joiner_profile_id IS DISTINCT FROM auth.uid()` is ALSO a substring of F2's guard
    // one block above, so it occurs twice in the function body — and this check is
    // `.includes()` over the whole body, not location-aware. With the short needle, deleting
    // F1's entire IF block leaves F2's occurrence behind and the canary stays GREEN. That was
    // the case as first committed, on the one guard in this file that has already regressed
    // this exact way (P1047 part 4). Caught by code review, not by the canary. Verified: the
    // long form occurs once, the short form twice.
    fn: 'claim_joiner_seat',
    needle: 'v_row.joiner_profile_id IS NOT NULL AND v_row.joiner_profile_id IS DISTINCT FROM auth.uid()',
    note: 'P1053 F1: a vacated seat still carries its participant. Without it, a stranger ' +
      'claims a room a signed-in joiner left and inherits their stored transcript while the ' +
      'departed participant loses access to their own. This is the P1047 part-4 shape, which ' +
      'regressed exactly this way — dropped during a CREATE OR REPLACE, unnoticed until the ' +
      'exploit was reproduced.',
  },
  {
    fn: 'claim_joiner_seat',
    needle: 'v_row.joiner_profile_id IS NOT DISTINCT FROM auth.uid()',
    note: 'P1053 F5: NULL-safe occupancy comparison. With plain `=`, a guest-held seat ' +
      '(joiner_profile_id IS NULL) makes the condition NULL for a signed-in caller, and ' +
      'plpgsql SKIPS an IF whose condition is NULL — the refusal guard silently becomes an ' +
      'allow, letting a stranger evict a live guest and become the participant. Reverting this ' +
      'one operator to `=` reopens it with no other visible change, which is why it is pinned.',
  },
  {
    // Needle spans the `OR` joining the two EXISTS. The bare table reference is also a
    // substring of the guest-reclaim arm's deliberate duplicate below, so it occurs twice —
    // same fragility as F1 above. The arm's copy uses `NOT EXISTS ... AND NOT EXISTS ...`,
    // so the `) OR EXISTS (` shape is unique to F2's own block.
    fn: 'claim_joiner_seat',
    needle:
      'EXISTS (SELECT 1 FROM public.session_transcripts t WHERE t.session_id = v_row.id) ' +
      'OR EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.session_id = v_row.id)',
    note: 'P1053 F2: a recorded session is not joinable by a newcomer — the guard that closes ' +
      'the anon-release-then-signed-in-claim laundering path, which F1 cannot catch because a ' +
      'guest seat has joiner_profile_id IS NULL.',
  },
  {
    // The guest-reclaim arm's OWN copy of the recording check, pinned separately. It is
    // redundant with F2 by guard ORDER, which is exactly why it needs pinning rather than a
    // test: no e2e test can exercise it while F2 sits above and fires first, so its removal
    // is invisible to the suite. Reported by code review as a vacuous sub-assertion in the
    // "recorded rooms are refused" canary — F2 alone explains that refusal.
    fn: 'claim_joiner_seat',
    needle:
      'AND NOT EXISTS (SELECT 1 FROM public.session_transcripts t WHERE t.session_id = v_row.id) ' +
      'AND NOT EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.session_id = v_row.id)',
    note: 'P1053: the guest-reclaim arm carries its own recording check so that moving F2 below ' +
      'the occupancy guard cannot silently widen the arm into "any code-holder may take a ' +
      'recorded guest room by name." Defense against a reorder, unreachable by any test.',
  },
  {
    fn: 'claim_joiner_seat',
    needle: 'v_row.joiner_name IS NOT DISTINCT FROM btrim(p_joiner_name)',
    note: 'P1053: NULL-safe guest name match. With a plain `=` this is the F5 shape one line ' +
      'over — NULL joiner_name makes the condition NULL, plpgsql skips the IF, and the refusal ' +
      'guard becomes an allow. Safe today only via the CHECK constraint in 20260812160000; ' +
      'pinned here so the operator cannot quietly revert to depending on it.',
  },
  {
    fn: 'claim_joiner_seat',
    needle: 'auth.uid() IS DISTINCT FROM v_row.target_listener_id',
    note: 'P1053 F3: addressee binding. SECURITY DEFINER bypasses RLS, so the predicate the ' +
      'clarity_sessions UPDATE policy was enforcing on the old direct-UPDATE path has to be ' +
      're-derived by hand here. Without it a forwarded invite link lets anyone take a seat ' +
      'addressed to a named person.',
  },
];

/**
 * Known PENDING regressions — predicate drops this canary now DETECTS but whose
 * restoration fix has not yet landed. Distinct from KNOWN_INTENTIONAL_REMOVALS:
 * these are NOT safe; each references an open bug spec and MUST be removed by that
 * fix (which re-applies the dropped clause, turning the assertion green for real).
 * This lets the detection capability land (P980) ahead of the migration fixes
 * without leaving the suite red. Burn this list down to empty.
 *
 * Key format: "<functionName>:<needle>"
 */
const KNOWN_PENDING_FIXES = new Set<string>([
  // P977/P978/P979 restored by migration 20260630130000 — the predicate now lives
  // in each function's latest definition, so the entries were removed (the anti-rot
  // guard requires removal once the drop is gone). The structural-predicate test
  // below now asserts these stay present, so a future re-drop fails.
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
  /** CRITICAL_PREDICATES needles this function carried in any version → first source file. */
  predicateHits: Map<string, string>;
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

  // Match BOTH `CREATE OR REPLACE FUNCTION` and bare `CREATE FUNCTION` (the latter
  // is how a `DROP FUNCTION; CREATE FUNCTION` redefinition reads — e.g. P964 — which
  // an OR-REPLACE-only regex is blind to, hiding any guard dropped in that rewrite).
  const fnRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
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
        records.set(funcName, {
          guards: [],
          latestFile: file,
          latestBody: body,
          predicateHits: new Map<string, string>(),
        });
      }

      const rec = records.get(funcName)!;

      // Accumulate new guards, deduplicating by kind + value
      for (const g of extractGuards(body, file)) {
        const key = `${g.kind}:${g.value}`;
        const seen = rec.guards.some((eg) => `${eg.kind}:${eg.value}` === key);
        if (!seen) rec.guards.push(g);
      }

      // Record any CRITICAL_PREDICATES this version of the function carried
      const normBody = normalizeSql(body);
      for (const p of CRITICAL_PREDICATES) {
        if (p.fn === funcName && normBody.includes(normalizeSql(p.needle))) {
          if (!rec.predicateHits.has(p.needle)) rec.predicateHits.set(p.needle, file);
        }
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

  it('every SECURITY DEFINER function retains every structural scope predicate (P977/P978/P979 class)', () => {
    const records = scanMigrations();

    const failures: string[] = [];
    const stalePending: string[] = [];
    const liveDrops = new Set<string>();

    for (const [funcName, rec] of records) {
      for (const [needle, source] of rec.predicateHits) {
        const key = `${funcName}:${needle}`;
        if (normalizeSql(rec.latestBody).includes(normalizeSql(needle))) continue; // still present

        liveDrops.add(key);
        if (KNOWN_PENDING_FIXES.has(key)) continue; // detected; restoration fix tracked + pending

        const note =
          CRITICAL_PREDICATES.find((p) => p.fn === funcName && p.needle === needle)?.note ?? '';
        failures.push(
          `  • ${funcName} (latest: ${rec.latestFile})\n` +
            `    dropped scope predicate first seen in ${source}:\n` +
            `    ${needle}\n` +
            (note ? `    ${note}\n` : '') +
            `    → Re-apply the predicate, or (if truly intentional) move it to ` +
            `KNOWN_INTENTIONAL_REMOVALS with a rationale.`,
        );
      }
    }

    // Anti-rot: a KNOWN_PENDING_FIXES entry whose drop is no longer present means the
    // restoration fix landed — the entry must be removed, or it silently masks a future re-drop.
    for (const key of KNOWN_PENDING_FIXES) {
      if (!liveDrops.has(key)) {
        stalePending.push(
          `  • ${key}\n` +
            `    → predicate is restored (fix landed); remove this KNOWN_PENDING_FIXES entry so a future re-drop fails.`,
        );
      }
    }

    expect(
      failures.length,
      `SECURITY DEFINER scope-predicate regression(s) detected (P977/P978/P979 class).\n` +
        `A function dropped a WHERE-whitelist / JOIN-scope / RETURN-gate that a prior version had —\n` +
        `the guard shape the RAISE/token canary is structurally blind to.\n\n` +
        failures.join('\n\n'),
    ).toBe(0);

    expect(
      stalePending.length,
      `Stale KNOWN_PENDING_FIXES entr(ies) — the drop is gone, so the entry now masks future re-drops:\n\n` +
        stalePending.join('\n\n'),
    ).toBe(0);
  });
});
