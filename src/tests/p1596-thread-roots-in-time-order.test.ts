/**
 * P1596: a thread root is stamped at the time its thread covers, so the channel (sorted by created_at) shows the
 * threads in time order, and the stamp never hides a thread from anyone who could read it before.
 * Source-level pins on the migration (the database tests need an applied server): the two root inserts use the stamp
 * function, the function floors at the latest VALID rsvp and caps at now, and nothing else about the post changed.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = 'supabase/migrations/';
const read = (f: string) => readFileSync(dir + f, 'utf8');
const NEW = read('20261102143000_p1596_thread_roots_in_time_order.sql');
const OLD = read('20261102133000_p1596_threads_in_time_order.sql');
const fnBody = (sql: string, name: string) => {
  const from = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return sql.slice(from, sql.indexOf('$$;', sql.indexOf('AS $$', from)));
};

describe('thread roots are stamped by the time they cover', () => {
  const post = fnBody(NEW, 'public._post_clean_round_item');

  it('neither root is stamped with the post-time clock any more', () => {
    const inserts = [...post.matchAll(/INSERT INTO public\.chat_messages \(conversation_id, author_id, body, kind, system_kind, created_at\)[\s\S]*?RETURNING id INTO v_root_id;/g)];
    expect(inserts).toHaveLength(2);
    for (const [ins] of inserts) expect(ins).toContain('_transcribe_root_time(');
    expect(inserts[0][0]).toContain('v_round.started_at');
    expect(inserts[1][0]).toMatch(/'before' THEN v_first - interval '1 second'/);
  });

  it('the stamp is floored at the latest valid RSVP and capped at now, so the readers of the root do not change', () => {
    const fn = fnBody(NEW, 'public._transcribe_root_time');
    expect(fn).toContain('max(r.rsvped_at)');
    expect(fn).toContain('r.rsvped_at <= e.datetime + public.event_grace_interval()');
    expect(fn).toMatch(/least\(clock_timestamp\(\), greatest\(p_desired,/);
    expect(NEW).toMatch(/REVOKE ALL ON FUNCTION public\._transcribe_root_time\(uuid, timestamptz, integer\) FROM PUBLIC, anon, authenticated;/);
  });

  it('every other line of the post function is the previous migration\'s, byte for byte', () => {
    const old = fnBody(OLD, 'public._post_clean_round_item');
    const strip = (s: string) => s.split('\n').filter((l) => !/clock_timestamp\(\)\)$|_transcribe_root_time|CASE v_place|WHEN 'before' THEN|WHEN 'after' THEN|ELSE clock_timestamp|FROM public\.event_rounds er WHERE er\.event_id = v_job\.event_id\)|clock_timestamp\(\)\) \+ interval|^\s*VALUES \(v_conv, NULL/.test(l)).join('\n');
    const oldLines = new Set(strip(old).split('\n'));
    const added = strip(post).split('\n').filter((l) => !oldLines.has(l));
    expect(added).toEqual([]);
  });

  it('declares its client-safety and what it was diffed against', () => {
    expect(NEW).toMatch(/^-- client-safe: /m);
    expect(NEW).toMatch(/^-- diffed against:/m);
  });
});
