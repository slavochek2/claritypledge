/**
 * @file p1675-hike-registration-migration.test.ts
 * @description P1675: source contract of the hike registration migration (answers table CHECKs and policy, register_for_hike,
 * the seat guard with the mastermind branch kept byte-identical, cancel cleanup, room counts). Every check is exercised against
 * a mutated copy of the real file at the end, so a green run proves the checks can fail.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = join(MIGRATIONS, '20261117120000_p1675_hike_registration.sql');
const PREVIOUS = join(MIGRATIONS, '20261106140000_p1529_host_add_past_limit.sql');

const code = (sql: string) => sql.replace(/--[^\n]*/g, '');
const body = (sql: string, fn: string) => {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$\\$;`).exec(code(sql));
  if (!m) throw new Error(`${fn} not found`);
  return m[0];
};
/** The sales-mastermind lines of the guard: from its flow test to the end of the body, raw text (comments included). */
const MASTERMIND_START = "  IF public._event_flow(NEW.event_id) <> 'sales-mastermind' THEN";
const mastermindBranch = (sql: string) => {
  const start = sql.indexOf(MASTERMIND_START);
  const end = sql.indexOf('  RETURN NEW;\nEND;\n$$;', start);
  if (start < 0 || end < 0) throw new Error('mastermind branch not found');
  return sql.slice(start, end + '  RETURN NEW;\nEND;\n$$;'.length);
};

function problems(sql: string, previous: string): string[] {
  const out: string[] = [];
  const c = code(sql);

  // Answers table
  for (const check of [
    /when_choice text NOT NULL CHECK \(when_choice IN \('now', 'later'\)\)/,
    /transport text NOT NULL CHECK \(transport IN \('car', 'motorbike', 'bike_or_foot', 'need_ride'\)\)/,
    /help text CHECK \(help IS NULL OR help IN \('lead', 'sweep', 'welcomer', 'transport_lead', 'other'\)\)/,
    /transport IN \('car', 'motorbike'\) AND free_seats IS NOT NULL AND free_seats BETWEEN 0 AND 20/,
    /transport IN \('bike_or_foot', 'need_ride'\) AND free_seats IS NULL/,
    /help = 'other' AND help_other IS NOT NULL AND help_other = btrim\(help_other\) AND length\(help_other\) BETWEEN 1 AND 280/,
    /help IS DISTINCT FROM 'other' AND help_other IS NULL/,
    /help IS DISTINCT FROM 'transport_lead' OR transport = 'need_ride'/,
    /PRIMARY KEY \(event_id, profile_id\)/,
    /event_id uuid NOT NULL REFERENCES public\.events\(id\) ON DELETE CASCADE/,
    /profile_id uuid NOT NULL REFERENCES public\.profiles\(id\) ON DELETE CASCADE/,
    /ENABLE ROW LEVEL SECURITY/,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.event_hike_answers FROM PUBLIC, anon, authenticated/,
    /GRANT SELECT ON TABLE public\.event_hike_answers TO authenticated/,
    /profile_id = \(SELECT auth\.uid\(\)\)\s+OR EXISTS \(SELECT 1 FROM public\.events e WHERE e\.id = event_id AND e\.host_id = \(SELECT auth\.uid\(\)\)\)/,
  ]) if (!check.test(c)) out.push(`table: missing ${check}`);
  if (/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*event_hike_answers/.test(c)) out.push('table: client write grant');

  // register_for_hike
  const reg = body(sql, 'register_for_hike');
  if (!/SECURITY DEFINER/.test(reg)) out.push('register_for_hike: not SECURITY DEFINER');
  if (!/SET search_path = ''/.test(reg)) out.push('register_for_hike: search_path not pinned');
  if (!/REVOKE ALL ON FUNCTION public\.register_for_hike\(text, text, text, integer, text, text\) FROM PUBLIC, anon/.test(c)) out.push('register_for_hike: not revoked from PUBLIC, anon');
  if (!/GRANT EXECUTE ON FUNCTION public\.register_for_hike\(text, text, text, integer, text, text\) TO authenticated/.test(c)) out.push('register_for_hike: not granted to authenticated');
  if (!/v_uid IS NULL THEN\s+RAISE EXCEPTION 'sign in to register' USING ERRCODE = '42501'/.test(reg)) out.push('register_for_hike: no sign-in check');
  if (!/_event_flow\(v_event\.id\) <> 'social-hike' THEN\s+RAISE EXCEPTION 'this event is not a hike' USING ERRCODE = '22023'/.test(reg)) out.push('register_for_hike: no hike-only refusal');
  if (!/transport lead is for people who need a ride/.test(reg)) out.push('register_for_hike: transport lead not refused');
  for (const r of ['not_found', 'cancelled', 'now_only', 'already', 'full', 'ok']) if (!new RegExp(`RETURN '${r}'`).test(reg)) out.push(`register_for_hike: never returns ${r}`);
  if (/recording/i.test(reg)) out.push('register_for_hike: mentions recording acceptance');
  if (/event_waitlist/.test(reg)) out.push('register_for_hike: touches the waiting list');
  const nowOnly = reg.indexOf("p_when = 'later' AND NOT (now() < v_event.datetime - interval '24 hours')");
  const firstInsert = reg.indexOf('INSERT INTO');
  if (nowOnly < 0) out.push('register_for_hike: no strict 24 h rule');
  else if (nowOnly > firstInsert) out.push('register_for_hike: now_only checked after a write');
  const alreadyAt = reg.indexOf("RETURN 'already'");
  if (alreadyAt < 0 || alreadyAt > firstInsert) out.push('register_for_hike: already not returned before the write');
  if (!/r\.profile_id IS DISTINCT FROM v_event\.host_id\) >= v_event\.max_attendees/.test(reg)) out.push('register_for_hike: limit does not exclude the host');
  if (!/INSERT INTO public\.event_hike_answers/.test(reg) || !/INSERT INTO public\.event_rsvps/.test(reg)) out.push('register_for_hike: does not write answers and rsvp');
  if (reg.indexOf('INSERT INTO public.event_hike_answers') > reg.indexOf('INSERT INTO public.event_rsvps')) out.push('register_for_hike: seat written before answers');

  // Seat guard
  const guard = body(sql, '_event_rsvps_need_answers');
  if (!/SET search_path = ''/.test(guard) || !/SECURITY DEFINER/.test(guard)) out.push('guard: not definer with pinned path');
  if (!/REVOKE ALL ON FUNCTION public\._event_rsvps_need_answers\(\) FROM PUBLIC, anon, authenticated/.test(c)) out.push('guard: not revoked from clients');
  if (!/_event_flow\(NEW\.event_id\) = 'social-hike'/.test(guard)) out.push('guard: no hike branch');
  if (!/e\.id = NEW\.event_id\)\s+AND NOT EXISTS \(SELECT 1 FROM public\.event_hike_answers/.test(guard) || !/NEW\.profile_id IS DISTINCT FROM \(SELECT e\.host_id/.test(guard)) out.push('guard: host exemption or answers lookup missing');
  if (!/this hike asks a few questions before registering' USING ERRCODE = 'P0001', HINT = 'answers_required'/.test(guard)) out.push('guard: hike refusal text');
  try {
    if (mastermindBranch(sql) !== mastermindBranch(previous)) out.push('guard: mastermind branch differs from the previous definition');
  } catch (e) {
    out.push(String(e));
  }
  if (mastermindBranch(previous).length < 500) out.push('guard: previous mastermind slice looks truncated');

  // Cancel cleanup
  const clear = body(sql, '_event_rsvps_clear_hike_answers');
  if (!/SECURITY DEFINER/.test(clear) || !/SET search_path = ''/.test(clear)) out.push('cleanup: not definer with pinned path');
  if (!/DELETE FROM public\.event_hike_answers h WHERE h\.event_id = OLD\.event_id AND h\.profile_id = OLD\.profile_id/.test(clear)) out.push('cleanup: does not delete the matching row');
  if (!/REVOKE ALL ON FUNCTION public\._event_rsvps_clear_hike_answers\(\) FROM PUBLIC, anon, authenticated/.test(c)) out.push('cleanup: not revoked');
  if (!/CREATE TRIGGER event_rsvps_clear_hike_answers AFTER DELETE ON public\.event_rsvps/.test(c)) out.push('cleanup: not an AFTER DELETE trigger');

  // Room counts
  const counts = body(sql, 'get_event_room_counts');
  if (!/SECURITY DEFINER/.test(counts) || !/SET search_path = ''/.test(counts)) out.push('counts: not definer with pinned path');
  if (!/REVOKE ALL ON FUNCTION public\.get_event_room_counts\(uuid\) FROM PUBLIC, anon/.test(c)) out.push('counts: not revoked');
  if (!/GRANT EXECUTE ON FUNCTION public\.get_event_room_counts\(uuid\) TO authenticated/.test(c)) out.push('counts: not granted');
  if (!/v_uid IS NULL THEN\s+RAISE EXCEPTION[^;]*42501/.test(counts)) out.push('counts: no sign-in check');
  if (!/event not visible' USING ERRCODE = '42501'/.test(counts)) out.push('counts: no visibility check');
  if (!/IF v_host IS NOT DISTINCT FROM v_uid THEN\s+v_result := v_result \|\|/.test(counts)) out.push('counts: merged numbers not host-only');
  if (!/'in'/.test(counts) || !/'out'/.test(counts) || !/'undecided'/.test(counts) || !/'not_here'/.test(counts)) out.push('counts: missing key');
  if (!/COALESCE\(\s*\(SELECT m\.opted_in FROM public\.event_room_members[\s\S]*?\(SELECT pr\.opted_in FROM public\.event_preparations/.test(counts)) out.push('counts: room answer does not win over preparation');
  const returned = counts.slice(counts.indexOf('v_result :='));
  if (/\bname\b|display_name|'profile_id'|'id'/.test(returned)) out.push('counts: returns a name or an id');
  return out;
}

describe('P1675 hike registration migration', () => {
  const sql = readFileSync(FILE, 'utf8');
  const previous = readFileSync(PREVIOUS, 'utf8');
  it('has no problems', () => expect(problems(sql, previous)).toEqual([]));

  it('controls: each mutation of the real file is caught', () => {
    const cases: Array<[string, string]> = [
      ['search_path dropped', sql.replace("SET search_path = ''", '')],
      ['now_only after the write', sql.replace("IF p_when = 'later' AND NOT (now() < v_event.datetime - interval '24 hours') THEN\n    RETURN 'now_only';\n  END IF;", '')
        .replace("  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);\n  RETURN 'ok';",
          "  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);\n  IF p_when = 'later' AND NOT (now() < v_event.datetime - interval '24 hours') THEN RETURN 'now_only'; END IF;\n  RETURN 'ok';")],
      ['24 h rule not strict', sql.replace("v_event.datetime - interval '24 hours') THEN", "v_event.datetime - interval '24 hours' + interval '1 second') THEN")],
      ['recording acceptance', sql.replace("RAISE EXCEPTION 'sign in to register'", "PERFORM p_recording_accepted; RAISE EXCEPTION 'sign in to register'")],
      ['mastermind branch edited', sql.replace("RAISE EXCEPTION 'this event is full'", "RAISE EXCEPTION 'this event is FULL'")],
      ['client write grant', sql.replace('GRANT SELECT ON TABLE public.event_hike_answers TO authenticated;', 'GRANT SELECT, INSERT ON TABLE public.event_hike_answers TO authenticated;')],
      ['seats check removed', sql.replace('free_seats BETWEEN 0 AND 20', 'free_seats >= 0')],
      ['other length removed', sql.replace('length(help_other) BETWEEN 1 AND 280', 'length(help_other) >= 1')],
      ['transport lead unconstrained', sql.replace("help IS DISTINCT FROM 'transport_lead' OR transport = 'need_ride'", 'true')],
      ['host exemption removed', sql.replace('NEW.profile_id IS DISTINCT FROM (SELECT e.host_id FROM public.events e WHERE e.id = NEW.event_id)\n       AND NOT EXISTS', 'NOT EXISTS')],
      ['cleanup not AFTER DELETE', sql.replace('AFTER DELETE ON public.event_rsvps', 'BEFORE INSERT ON public.event_rsvps')],
      ['counts merged for everyone', sql.replace('IF v_host IS NOT DISTINCT FROM v_uid THEN', 'IF true THEN')],
      ['counts leak names', sql.replace("'not_here', v_not_here", "'not_here', v_not_here, 'name', 'x'")],
      ['hike refusal missing', sql.replace("'this event is not a hike'", "'nope'")],
    ];
    for (const [name, mutated] of cases) {
      expect(mutated, `${name}: mutation did not change the file`).not.toEqual(sql);
      expect(problems(mutated, previous), name).not.toEqual([]);
    }
  });
});
