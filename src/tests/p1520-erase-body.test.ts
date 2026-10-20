/**
 * P1520 redefines public.erase_chat_data_for() (first defined by P1512) to append step 6, which
 * cancels AI jobs and scrubs AI replies derived from the erased person. The rest of the body must stay
 * P1512's, byte for byte: if P1512's copy changes later, this file's redefinition would silently undo
 * that change on the next apply. This test turns that drift into a failure.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIG = resolve(__dirname, '../../supabase/migrations');
const P1512 = readFileSync(resolve(MIG, '20261019203000_p1512_clarity_chat.sql'), 'utf8');
const P1520 = readFileSync(resolve(MIG, '20261020213000_p1520_mirror_v2.sql'), 'utf8');

function eraseBody(sql: string): string {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid)');
  if (start < 0) throw new Error('erase_chat_data_for not found');
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end + 3);
}

/** Step 6 is the block from its comment up to (not including) `  RETURN v_out;`. */
function withoutStep6(body: string): string {
  const s6 = body.indexOf('  -- 6. (P1520)');
  const ret = body.indexOf('  RETURN v_out;');
  if (s6 < 0 || ret < s6) throw new Error('step 6 not found before RETURN');
  return body.slice(0, s6) + body.slice(ret);
}

describe('P1520 erase_chat_data_for redefinition', () => {
  it('is P1512\'s body plus exactly step 6', () => {
    expect(withoutStep6(eraseBody(P1520))).toBe(eraseBody(P1512));
  });

  it('step 6 cancels derived jobs before scrubbing derived replies', () => {
    const body = eraseBody(P1520);
    const jobs = body.indexOf('UPDATE public.mirror_jobs');
    const replies = body.indexOf("WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref]");
    expect(jobs).toBeGreaterThan(0);
    expect(replies).toBeGreaterThan(jobs);
  });

  it('CONTROL: a one-character change to the copied part is detected', () => {
    const mutated = eraseBody(P1520).replace("'Deleted user'", "'Deleted  user'");
    expect(withoutStep6(mutated)).not.toBe(eraseBody(P1512));
  });
});
