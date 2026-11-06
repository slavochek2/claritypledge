/**
 * P1529 D24: source contract of the waiting-list promote migration (host check, grants, search_path, no leaks). Each check is
 * exercised against a mutated copy of the real file at the end, so a green run proves the checks can fail.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(__dirname, '..', '..', 'supabase', 'migrations', '20261106120000_p1529_waitlist_promote.sql');
const code = (sql: string) => sql.replace(/--[^\n]*/g, '');
const body = (sql: string, fn: string) => {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$\\$;`).exec(code(sql));
  if (!m) throw new Error(`${fn} not found`);
  return m[0];
};

function problems(sql: string): string[] {
  const out: string[] = [];
  const c = code(sql);
  for (const fn of ['host_add_from_waitlist', 'get_event_waitlist_public']) {
    const b = body(sql, fn);
    if (!/SECURITY DEFINER/.test(b)) out.push(`${fn}: not SECURITY DEFINER`);
    if (!/SET search_path = ''/.test(b)) out.push(`${fn}: search_path not pinned`);
    if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(uuid(, uuid)?\\) FROM PUBLIC, anon`).test(c)) out.push(`${fn}: not revoked from PUBLIC, anon`);
    if (!new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(uuid(, uuid)?\\) TO authenticated`).test(c)) out.push(`${fn}: not granted to authenticated`);
  }
  const add = body(sql, 'host_add_from_waitlist');
  if (!/e\.id = p_event AND e\.host_id = v_uid/.test(add)) out.push('host_add_from_waitlist: no host check');
  if (/max_attendees/.test(add)) out.push('host_add_from_waitlist: reads the limit (the host decides)');
  if (!/INSERT INTO public\.event_registration_answers/.test(add) || !/INSERT INTO public\.event_rsvps/.test(add)) out.push('host_add_from_waitlist: does not write answers and rsvp');
  if (!/DELETE FROM public\.event_waitlist/.test(add)) out.push('host_add_from_waitlist: does not clear the list entry');
  const pub = body(sql, 'get_event_waitlist_public');
  if (/email|hope|phone|participation|observer_prep/.test(pub.replace(/FROM public\.event_waitlist[\s\S]*$/, ''))) out.push('get_event_waitlist_public: returns an answer or an email');
  if (!/event_rsvps r WHERE r\.event_id = p_event AND r\.profile_id = v_uid/.test(pub) || !/e\.host_id = v_uid/.test(pub)) out.push('get_event_waitlist_public: not limited to host and registered');
  if (/CREATE TABLE|CREATE POLICY|ALTER TABLE/.test(c)) out.push('touches tables or policies');
  return out;
}

describe('P1529 waitlist promote migration', () => {
  const sql = readFileSync(FILE, 'utf8');
  it('has no problems', () => expect(problems(sql)).toEqual([]));

  it('controls: each mutation of the real file is caught', () => {
    const cases: Array<[string, string]> = [
      ['no host check', sql.replace('e.id = p_event AND e.host_id = v_uid FOR UPDATE', 'e.id = p_event FOR UPDATE')],
      ['search_path dropped', sql.replace("SET search_path = ''", '')],
      ['granted to anon', sql.replace('host_add_from_waitlist(uuid, uuid) FROM PUBLIC, anon', 'host_add_from_waitlist(uuid, uuid) FROM PUBLIC')],
      ['limit checked', sql.replace("RAISE EXCEPTION 'this event is cancelled'", "PERFORM max_attendees; RAISE EXCEPTION 'this event is cancelled'")],
      ['answers leaked', sql.replace("'position', q.position)", "'position', q.position, 'phone', 'x')")],
    ];
    for (const [name, mutated] of cases) expect(problems(mutated), name).not.toEqual([]);
  });
});
