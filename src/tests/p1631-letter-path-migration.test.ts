/**
 * @file p1631-letter-path-migration.test.ts
 * @description P1631 M2: source contract for migration 20261112210000_p1631_letter_path.sql.
 *   - each restated body is its NEWEST previous body plus ONLY the lines marked `-- P1631 letter`;
 *   - the marked conditions are present (seal skips a point with a point_chat_shares row; the token RPC refuses one before any write);
 *   - grants and search_path are as the newest previous file had them;
 *   - the header carries client-safe and diffed against.
 * Epistemic gate 7: the last block runs the body check against a mutated copy of the real file and shows it fail.
 * The behaviour is proved on the test database by src/tests/integration/p1631-letter-path.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261112210000_p1631_letter_path.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const MARK = '-- P1631 letter';

/** The text of `CREATE OR REPLACE FUNCTION <name>(` up to its closing `$$;`, comments kept (the marked lines are comments' neighbours, so they are compared whole). */
function fnBody(sql: string, name: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${name}\\(`);
  const m = re.exec(sql);
  if (!m) throw new Error(`${name} not found`);
  return sql.slice(m.index, sql.indexOf('$$;', sql.indexOf('AS $$', m.index)) + 3);
}
/** The newest migration before FILE that defines `name`. */
function newestBefore(name: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${name}\\s*\\(`, 'i');
  const defs = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f < FILE && re.test(read(f))).sort();
  return defs[defs.length - 1]!;
}
/** The body with every line that carries the marker removed, and the stand-alone `-- P1631 letter:` comment lines too. */
function withoutMarked(body: string): string {
  return body.split('\n').filter((l) => !l.includes(MARK)).join('\n');
}

const raw = read(FILE);
const SEAL = 'seal_and_send_letter';
const SUBMIT = 'submit_point_response_by_token';

describe('P1631 M2 migration: header and file', () => {
  it('carries client-safe, diffed against, and names the source of each body', () => {
    expect(raw).toMatch(/^-- client-safe:/m);
    expect(raw).toMatch(/diffed against/);
    expect(raw).toContain(`${SEAL}             ${newestBefore(SEAL)}`);
    expect(raw).toContain(`${SUBMIT}   ${newestBefore(SUBMIT)}`);
  });
  it('replaces exactly the two functions, in one transaction', () => {
    const defs = [...raw.matchAll(/CREATE OR REPLACE FUNCTION (\w+)\(/g)].map((m) => m[1]);
    expect(defs).toEqual([SEAL, SUBMIT]);
    expect(raw).toMatch(/^BEGIN;$/m);
    expect(raw).toMatch(/^COMMIT;$/m);
  });
});

describe('P1631 M2 migration: bodies are the newest previous body plus only marked lines', () => {
  for (const name of [SEAL, SUBMIT]) {
    it(`${name}: removing the marked lines gives the previous body byte for byte`, () => {
      const prev = fnBody(read(newestBefore(name)), name);
      expect(withoutMarked(fnBody(raw, name))).toBe(prev);
      expect(fnBody(raw, name).split('\n').filter((l) => l.includes(MARK)).length).toBeGreaterThan(0);
    });
  }
});

describe('P1631 M2 migration: the marked conditions', () => {
  it('seal_and_send_letter skips a point with ANY point_chat_shares row inside the snapshot point list', () => {
    const body = fnBody(raw, SEAL);
    const cond = 'AND NOT EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = pt.id)';
    expect(body).toContain(cond);
    // it sits in the points sub-select, after the P1515 visibility condition and before the end of that select
    const p1515 = body.indexOf("pt.first_validator_id = v_sender_id)");
    const here = body.indexOf(cond);
    const end = body.indexOf("), '[]'::jsonb", here);
    expect(p1515).toBeGreaterThan(-1);
    expect(here).toBeGreaterThan(p1515);
    expect(end).toBeGreaterThan(here);
  });
  it('submit_point_response_by_token refuses a shared point after the snapshot guard and before the first write', () => {
    const body = fnBody(raw, SUBMIT);
    const refuse = body.indexOf('IF EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = p_point_id) THEN');
    expect(refuse).toBeGreaterThan(-1);
    expect(body.slice(refuse, refuse + 400)).toMatch(/RETURN false;/);
    expect(refuse).toBeGreaterThan(body.indexOf('jsonb_array_elements(lss.point_config'));
    expect(refuse).toBeLessThan(body.indexOf('INSERT INTO letter_point_responses'));
    expect(refuse).toBeLessThan(body.indexOf('INSERT INTO point_positions'));
  });
});

describe('P1631 M2 migration: grants and search_path as the newest files had them', () => {
  it('seal_and_send_letter: revoked from PUBLIC, anon and authenticated, granted to authenticated', () => {
    expect(raw).toContain('REVOKE ALL ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;');
    expect(raw).toContain('GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) TO authenticated;');
    expect(raw).not.toMatch(/seal_and_send_letter\([^)]*\) TO anon/);
  });
  it('submit_point_response_by_token: granted to anon and authenticated, as before, and never revoked here', () => {
    expect(raw).toContain('GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO anon;');
    expect(raw).toContain('GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO authenticated;');
    expect(raw).not.toMatch(/REVOKE[^;]*submit_point_response_by_token/);
  });
  it('both bodies are SECURITY DEFINER with the search_path the previous body had', () => {
    for (const name of [SEAL, SUBMIT]) {
      const prev = fnBody(read(newestBefore(name)), name);
      const mine = fnBody(raw, name);
      expect(mine).toContain('SECURITY DEFINER');
      expect(mine).toContain('SET search_path = public');
      expect(prev).toContain('SET search_path = public');
    }
  });
});

describe('P1631 review fixes migration 20261112230000: replay_letter_positions skips a chat-published point', () => {
  const REV = '20261112230000_p1631_review_fixes.sql';
  const SRC = '20260818090000_p1093_close_unchecked_payload_writer.sql';
  const REVMARK = '-- P1631 review fixes';
  const revRaw = read(REV);
  /** `$function$` body of replay_letter_positions, comments kept. */
  const replay = (sql: string) => {
    const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.replay_letter_positions()');
    if (i < 0) throw new Error('replay_letter_positions not found');
    return sql.slice(i, sql.indexOf('$function$;', sql.indexOf('AS $function$', i)) + '$function$;'.length);
  };
  const strip = (s: string) => s.split('\n').filter((l) => !l.includes(REVMARK)).join('\n');

  it('SRC is the only earlier definition of replay_letter_positions (no other overload or newer body)', () => {
    const re = /FUNCTION\s+(?:public\.)?replay_letter_positions\s*\(/i;
    const defs = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && re.test(read(f))).sort();
    // 20261112240000 (adversary fixes) legitimately replaces it again, from the 230000 body
    // 20261112250000 (event-only exclusion) replaces it once more, from the 240000 body
    expect(defs).toEqual([SRC, REV, '20261112240000_p1631_adversary_fixes.sql', '20261112250000_p1631_event_only_exclusion.sql']);
  });

  it('the body is the previous body byte for byte once the marked line is removed', () => {
    expect(strip(replay(revRaw))).toBe(replay(read(SRC)));
    expect(replay(revRaw).split('\n').filter((l) => l.includes(REVMARK))).toHaveLength(1);
  });

  it('skips a point with a point_chat_shares row, inside the staged-response select and before the INSERT conflict clause', () => {
    const body = replay(revRaw);
    const cond = 'AND NOT EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = lpr.point_id)';
    expect(body).toContain(cond);
    expect(body.indexOf(cond)).toBeGreaterThan(body.indexOf('WHERE ld.receiver_profile_id = v_caller_id'));
    expect(body.indexOf(cond)).toBeLessThan(body.indexOf('ON CONFLICT (point_id, user_id) DO NOTHING'));
  });

  it('keeps SECURITY DEFINER, the search_path and the grants', () => {
    const body = replay(revRaw);
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain("SET search_path TO 'public'");
    expect(revRaw).toContain('REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM PUBLIC;');
    expect(revRaw).toContain('REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM anon;');
    expect(revRaw).toContain('GRANT EXECUTE ON FUNCTION public.replay_letter_positions() TO authenticated;');
    expect(revRaw).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.replay_letter_positions\(\) TO anon/);
  });

  it('gate 7: removing the guard from a copy of the real file is caught', () => {
    const mutated = revRaw.replace('AND NOT EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = lpr.point_id)', 'AND true');
    expect(mutated).not.toBe(revRaw);
    expect(replay(mutated)).not.toContain('pcs.point_id = lpr.point_id');
  });
});

describe('P1631 adversary fixes migration 20261112240000: letters', () => {
  const ADV = '20261112240000_p1631_adversary_fixes.sql';
  const advRaw = read(ADV);
  const AMARK = '-- P1631 adversary fixes';
  const strip = (s: string) => s.split('\n').filter((l) => !l.includes(AMARK)).join('\n');
  const replay = (sql: string) => {
    const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.replay_letter_positions()');
    return sql.slice(i, sql.indexOf('$function$;', sql.indexOf('AS $function$', i)) + '$function$;'.length);
  };
  const cd = 'EXISTS (SELECT 1 FROM public.clarify_drafts cdr WHERE cdr.point_id =';

  it('each body is its newest previous body (210000 / 210000 / 230000) plus only marked lines', () => {
    expect(strip(fnBody(advRaw, SEAL))).toBe(fnBody(read('20261112210000_p1631_letter_path.sql'), SEAL));
    expect(strip(fnBody(advRaw, SUBMIT))).toBe(fnBody(read('20261112210000_p1631_letter_path.sql'), SUBMIT));
    expect(strip(replay(advRaw))).toBe(replay(read('20261112230000_p1631_review_fixes.sql')));
  });

  it('seal leaves a Clarify point out of the snapshot, next to the chat-shares exclusion', () => {
    const b = fnBody(advRaw, SEAL);
    const sh = b.indexOf('NOT EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = pt.id)');
    const at = b.indexOf(`NOT ${cd} pt.id)`);
    expect(at).toBeGreaterThan(sh);
    expect(at).toBeLessThan(b.indexOf("), '[]'::jsonb", at));
  });

  it('seal scrubs order and hidden down to the ids in the snapshot points, after the insert and before the predictions', () => {
    const b = fnBody(advRaw, SEAL);
    const at = b.indexOf('UPDATE letter_story_snapshots lss SET point_config = lss.point_config ||');
    expect(at).toBeGreaterThan(b.indexOf('ON CONFLICT (letter_id, story_id) DO NOTHING;'));
    expect(at).toBeLessThan(b.indexOf('FOR v_pred IN'));
    const blk = b.slice(at, b.indexOf('FOR v_pred IN'));
    for (const f of ["'order'", "'hidden'", "jsonb_typeof(lss.point_config->'order') = 'array'", "jsonb_typeof(lss.point_config->'hidden') = 'array'", "jsonb_array_elements(lss.point_config->'points') kp", 'WHERE lss.letter_id = p_letter_id']) expect(blk, f).toContain(f);
  });

  it('submit refuses a Clarify point before the first write', () => {
    const b = fnBody(advRaw, SUBMIT);
    const flat = b.replace(/\s+/g, ' ');
    expect(flat).toContain(`IF ${cd} p_point_id) THEN -- P1631 adversary fixes RETURN false; -- P1631 adversary fixes END IF;`);
    expect(b.indexOf(`${cd} p_point_id)`)).toBeLessThan(b.indexOf('INSERT INTO letter_point_responses'));
    expect(b.indexOf(`${cd} p_point_id)`)).toBeGreaterThan(b.indexOf('pcs.point_id = p_point_id'));
  });

  it('replay skips a Clarify point and copies only answers for a point in that delivery\'s sealed letter', () => {
    const b = replay(advRaw);
    expect(b).toContain(`NOT ${cd} lpr.point_id)`);
    const snap = 'AND EXISTS (SELECT 1 FROM public.letter_story_snapshots lss, jsonb_array_elements(lss.point_config->\'points\') kp';
    expect(b).toContain(snap);
    expect(b).toContain("WHERE lss.letter_id = ld.letter_id AND (kp->>'id')::uuid = lpr.point_id)");
    expect(b.indexOf(snap)).toBeGreaterThan(b.indexOf('WHERE ld.receiver_profile_id = v_caller_id'));
    expect(b.indexOf(snap)).toBeLessThan(b.indexOf('ON CONFLICT (point_id, user_id) DO NOTHING'));
    expect(advRaw).toContain('PREDATES P1631');
  });

  it('keeps every grant', () => {
    expect(advRaw).toContain('REVOKE ALL ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;');
    expect(advRaw).toContain('GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) TO authenticated;');
    expect(advRaw).toContain('GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO anon;');
    expect(advRaw).toContain('GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO authenticated;');
    expect(advRaw).toContain('REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM PUBLIC;');
    expect(advRaw).toContain('REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM anon;');
    expect(advRaw).toContain('GRANT EXECUTE ON FUNCTION public.replay_letter_positions() TO authenticated;');
  });

  it('gate 7: removing the snapshot condition from a copy of the real file is caught', () => {
    const mutated = advRaw.replace("WHERE lss.letter_id = ld.letter_id AND (kp->>'id')::uuid = lpr.point_id)", 'WHERE true)');
    expect(mutated).not.toBe(advRaw);
    expect(replay(mutated)).not.toContain('lss.letter_id = ld.letter_id');
  });
});

describe('P1631 event-only migration 20261112250000: the replay join is type-guarded (N2)', () => {
  const EV = '20261112250000_p1631_event_only_exclusion.sql';
  const PREV = '20261112240000_p1631_adversary_fixes.sql';
  const evRaw = read(EV);
  const replay = (sql: string) => {
    const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.replay_letter_positions()');
    return sql.slice(i, sql.indexOf('$function$;', sql.indexOf('AS $function$', i)) + '$function$;'.length);
  };
  const REPLACED = ['AND EXISTS (SELECT 1 FROM public.letter_story_snapshots lss', "WHERE lss.letter_id = ld.letter_id AND (kp->>'id')::uuid"];
  const withoutNew = (s: string) => s.split('\n').filter((l) => !l.includes('P1631 event only')).join('\n');
  const withoutOld = (s: string) => s.split('\n').filter((l) => !REPLACED.some((p) => l.trim().startsWith(p))).join('\n');

  it('240000 is the newest definition before this file', () => {
    const re = /FUNCTION\s+(?:public\.)?replay_letter_positions\s*\(/i;
    const defs = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f < EV && re.test(read(f))).sort();
    expect(defs[defs.length - 1]).toBe(PREV);
  });

  it('the body is the 240000 body once the two replaced lines and the marked new lines are removed', () => {
    expect(withoutNew(replay(evRaw))).toBe(withoutOld(replay(read(PREV))));
    expect(replay(evRaw).split('\n').filter((l) => l.includes('P1631 event only'))).toHaveLength(2);
  });

  it('the snapshot join uses the P705 type guard and compares the id as text', () => {
    const b = replay(evRaw).replace(/\s+/g, ' ');
    expect(b).toContain("jsonb_array_elements(CASE WHEN jsonb_typeof(lss.point_config->'points') = 'array' THEN lss.point_config->'points' ELSE '[]'::jsonb END) kp");
    expect(b).toContain("WHERE lss.letter_id = ld.letter_id AND kp->>'id' = lpr.point_id::text)");
    expect(b).not.toContain("::uuid = lpr.point_id");
    // the same guard text as P705's token path
    expect(read('20260415160001_p705_fix_point_guard_null_safe.sql')).toContain("CASE WHEN jsonb_typeof(lss.point_config->'points') = 'array'");
    expect(b).toContain("DISTINCT ON (lpr.point_id)");
  });

  it('keeps the grants', () => {
    expect(evRaw).toContain('REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM PUBLIC;');
    expect(evRaw).toContain('REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM anon;');
    expect(evRaw).toContain('GRANT EXECUTE ON FUNCTION public.replay_letter_positions() TO authenticated;');
  });

  it('gate 7: reverting the guard in a copy of the real file is caught', () => {
    const mutated = evRaw.replace("CASE WHEN jsonb_typeof(lss.point_config->'points') = 'array' THEN lss.point_config->'points' ELSE '[]'::jsonb END", "lss.point_config->'points'");
    expect(mutated).not.toBe(evRaw);
    expect(replay(mutated)).not.toContain('jsonb_typeof');
  });
});

describe('gate 7: the body check fails on a mutated copy of the real file', () => {
  it('an extra unmarked line in a restated body is caught', () => {
    const mutated = raw.replace('RETURN jsonb_build_object(\'sealed\', true,', 'PERFORM 1;\n  RETURN jsonb_build_object(\'sealed\', true,');
    expect(mutated).not.toBe(raw);
    const prev = fnBody(read(newestBefore(SEAL)), SEAL);
    expect(withoutMarked(fnBody(mutated, SEAL))).not.toBe(prev);
  });
  it('dropping the refusal from the token function is caught by the condition check', () => {
    const mutated = raw.replace('IF EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = p_point_id) THEN', 'IF false THEN');
    expect(fnBody(mutated, SUBMIT)).not.toContain('pcs.point_id = p_point_id');
  });
});
