/**
 * P1529 founder UAT round 1, /finish review fixes: the migration source holds each fix. Runtime proof is the integration spec
 * e2e/integration/p1529-db-schema.spec.ts ("waiting list promote ... past the limit").
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const fn = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe('the host may take the event past its limit (20261106140000)', () => {
  const trigger = fn(read('20261106140000_p1529_host_add_past_limit.sql'), '_event_rsvps_need_answers');
  it('skips the full check only when the event host is the one inserting', () => {
    expect(trigger).toContain('(SELECT auth.uid()) IS DISTINCT FROM v_host');
    expect(trigger).toContain("RAISE EXCEPTION 'this event is full'");
    // the answers check still applies to everyone, the host's add included
    expect(trigger).toContain("HINT = 'answers_required'");
  });
});

describe('waiting-list review fixes (20261106150000)', () => {
  const sql = read('20261106150000_p1529_review_fixes_waitlist.sql');
  it('refuses a removed person joining the waiting list', () => {
    const join = fn(sql, 'join_event_waitlist');
    expect(join).toMatch(/event_removals x WHERE x\.event_id = v_event\.id AND x\.user_id = v_uid\)\s*THEN\s*RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501'/);
  });
  it('shows attendees no removed person on the waiting list', () => {
    expect(fn(sql, 'get_event_waitlist_public')).toContain('NOT EXISTS (SELECT 1 FROM public.event_removals x');
  });
  it('locks the list row the add reads, so a racing leave cannot end in a registration', () => {
    expect(fn(sql, 'host_add_from_waitlist')).toMatch(/FROM public\.event_waitlist w WHERE w\.event_id = p_event AND w\.profile_id = p_user FOR UPDATE/);
  });
  it('returns a canvas title only while the canvas is shared with the event', () => {
    expect(fn(sql, 'get_mastermind_host_state')).toMatch(/'canvas_title', CASE WHEN public\._event_canvas_shared\(p_event, p\.profile_id\) THEN/);
  });
  it('a removal clears the waiting-list row, and the host state leaves removed people out (20261106160000)', () => {
    const later = read('20261106160000_p1529_removal_clears_waitlist.sql');
    expect(later).toMatch(/CREATE TRIGGER event_removal_clears_waitlist AFTER INSERT ON public\.event_removals/);
    expect(fn(later, '_event_removal_clears_waitlist')).toContain('DELETE FROM public.event_waitlist w WHERE w.event_id = NEW.event_id AND w.profile_id = NEW.user_id');
    const host = fn(later, 'get_mastermind_host_state');
    expect(host.match(/NOT EXISTS \(SELECT 1 FROM public\.event_removals x WHERE x\.event_id = p_event AND x\.user_id = w\.profile_id\)/g)?.length).toBe(2);
    // the title stays gated on sharing in the newest definition
    expect(host).toMatch(/'canvas_title', CASE WHEN public\._event_canvas_shared\(p_event, p\.profile_id\) THEN/);
  });
  it('keeps every function SECURITY DEFINER with an empty search_path', () => {
    for (const name of ['join_event_waitlist', 'host_add_from_waitlist', 'get_event_waitlist_public', 'get_mastermind_host_state']) {
      const body = fn(sql, name);
      expect(body, name).toContain('SECURITY DEFINER');
      expect(body, name).toContain("SET search_path = ''");
    }
  });
});
