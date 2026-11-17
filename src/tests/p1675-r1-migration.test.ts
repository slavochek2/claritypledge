/**
 * @file p1675-r1-migration.test.ts
 * @description P1675 UAT round 1 R6/R7: source contract of 20261117210000_p1675_hike_questions_per_event.sql (event columns,
 * nullable transport, rewritten constraints, register_for_hike branches) and of the send-event-emails feedback gating.
 * Each check is also run against a mutated copy of the real file, so a check that cannot fail is caught.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const FILE = join(ROOT, 'supabase', 'migrations', '20261117210000_p1675_hike_questions_per_event.sql');
const INDEX = join(ROOT, 'supabase', 'functions', 'send-event-emails', 'index.ts');

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) return '';
  return sql.slice(start, sql.indexOf('$$;', start));
}

function checks(sql: string): string[] {
  const failed: string[] = [];
  const reg = fnBody(sql, 'register_for_hike');
  if (/^\s*(BEGIN|COMMIT);/m.test(sql)) failed.push('no BEGIN/COMMIT');
  if (!/hike_asks_transport boolean NOT NULL DEFAULT true/.test(sql)) failed.push('transport column');
  if (!/hike_asks_help boolean NOT NULL DEFAULT true/.test(sql)) failed.push('help column');
  if (!/COMMENT ON COLUMN public\.events\.hike_asks_transport/.test(sql) || !/COMMENT ON COLUMN public\.events\.hike_asks_help/.test(sql)) failed.push('column comments');
  if (!/ALTER COLUMN transport DROP NOT NULL/.test(sql)) failed.push('transport nullable');
  const seats = sql.slice(sql.indexOf('ADD CONSTRAINT event_hike_answers_free_seats_motor_only'), sql.indexOf('event_hike_answers_transport_lead_needs_ride CHECK'));
  if (!/\(transport IS NULL AND free_seats IS NULL\)/.test(seats) || !/transport IS NOT NULL AND/.test(seats)) failed.push('NULL transport requires NULL seats');
  if (!/help IS DISTINCT FROM 'transport_lead' OR transport IS NOT DISTINCT FROM 'need_ride'/.test(sql)) failed.push('transport lead check null-safe');
  if (!/DROP CONSTRAINT IF EXISTS event_hike_answers_free_seats_motor_only/.test(sql)
    || !/DROP CONSTRAINT IF EXISTS event_hike_answers_transport_lead_needs_ride/.test(sql)) failed.push('old constraints dropped');
  // RPC
  if (!/SECURITY DEFINER\s+SET search_path = ''/.test(reg)) failed.push('search_path');
  if (!/IF v_event\.hike_asks_transport THEN/.test(reg)) failed.push('reads transport setting');
  if (!/IF v_event\.hike_asks_help THEN/.test(reg)) failed.push('reads help setting');
  if (!/v_transport := NULL;\s+v_seats := NULL;/.test(reg)) failed.push('transport not asked stores NULL');
  if (!/v_help := NULL;\s+v_other := NULL;/.test(reg)) failed.push('help not asked stores NULL');
  if (!/choose how you are coming/.test(reg)) failed.push('transport still required when asked');
  if (!/v_help = 'transport_lead' AND v_transport IS DISTINCT FROM 'need_ride'/.test(reg)) failed.push('transport lead refused unless need_ride');
  const already = reg.indexOf("RETURN 'already'");
  const nowOnly = reg.indexOf("RETURN 'now_only'");
  if (already < 0 || nowOnly < 0 || already > nowOnly) failed.push('already before now_only');
  if (!/now\(\) < v_event\.datetime - interval '24 hours 30 minutes'\)/.test(reg)) failed.push('strict 24h rule');
  if (!/RETURN 'full'/.test(reg) || !/RETURN 'cancelled'/.test(reg) || !/this event is not a hike/.test(reg)) failed.push('existing rules kept');
  if (!/VALUES \(v_event\.id, v_uid, p_when, v_transport, v_seats, v_help, v_other, v_event\.hike_asks_help\)/.test(reg)) failed.push('stores the resolved values');
  if (!/ADD COLUMN IF NOT EXISTS asked_help boolean NOT NULL DEFAULT true/.test(sql)) failed.push('asked_help column');
  if (!/COMMENT ON COLUMN public\.event_hike_answers\.asked_help/.test(sql)) failed.push('asked_help comment');
  if (!/asked_help = EXCLUDED\.asked_help/.test(reg)) failed.push('asked_help on conflict update');
  if (/recording/i.test(reg)) failed.push('no recording acceptance');
  if (!/REVOKE ALL ON FUNCTION public\.register_for_hike\(text, text, text, integer, text, text\) FROM PUBLIC, anon;/.test(sql)) failed.push('revoke');
  if (!/GRANT EXECUTE ON FUNCTION public\.register_for_hike\(text, text, text, integer, text, text\) TO authenticated;/.test(sql)) failed.push('grant');
  if (/GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO (anon|PUBLIC)/.test(sql)) failed.push('no anon grant');
  return failed;
}

describe('P1675 R6 migration: hike questions per event', () => {
  const sql = readFileSync(FILE, 'utf8');

  it('meets every contract', () => {
    expect(checks(sql)).toEqual([]);
  });

  it('each contract fails on a mutated copy of the real file', () => {
    const mutations: Array<[string, string]> = [
      ['transport column', sql.replace('hike_asks_transport boolean NOT NULL DEFAULT true', 'hike_asks_transport boolean')],
      ['help column', sql.replace('hike_asks_help boolean NOT NULL DEFAULT true', 'hike_asks_help boolean DEFAULT false')],
      ['transport nullable', sql.replace('ALTER COLUMN transport DROP NOT NULL', 'ALTER COLUMN transport SET NOT NULL')],
      ['NULL transport requires NULL seats', sql.replace('(transport IS NULL AND free_seats IS NULL)', '(transport IS NULL)')],
      ['transport lead check null-safe', sql.replace("transport IS NOT DISTINCT FROM 'need_ride'", "transport = 'need_ride'")],
      ['reads transport setting', sql.replace('IF v_event.hike_asks_transport THEN', 'IF true THEN')],
      ['reads help setting', sql.replace('IF v_event.hike_asks_help THEN', 'IF true THEN')],
      ['transport not asked stores NULL', sql.replace('v_transport := NULL;', 'v_transport := p_transport;')],
      ['help not asked stores NULL', sql.replace('v_help := NULL;', 'v_help := p_help;')],
      ['transport lead refused unless need_ride', sql.replace("v_transport IS DISTINCT FROM 'need_ride'", "v_transport <> 'need_ride'")],
      ['stores the resolved values', sql.replace('v_other, v_event.hike_asks_help)', 'v_other, true)')],
      ['asked_help column', sql.replace('asked_help boolean NOT NULL DEFAULT true;', 'asked_help boolean;')],
      ['asked_help comment', sql.replace('COMMENT ON COLUMN public.event_hike_answers.asked_help', 'COMMENT ON COLUMN public.event_hike_answers.help')],
      ['asked_help on conflict update', sql.replace('asked_help = EXCLUDED.asked_help, ', '')],
      ['strict 24h rule', sql.replace("interval '24 hours 30 minutes'", "interval '24 hours'")],
      ['already before now_only', sql.replace("RETURN 'already';", 'NULL;')],
      ['revoke', sql.replace('REVOKE ALL ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) FROM PUBLIC, anon;', '')],
      ['no anon grant', sql.replace('TO authenticated;', 'TO anon;')],
      ['no BEGIN/COMMIT', `BEGIN;\n${sql}\nCOMMIT;`],
    ];
    for (const [name, mutated] of mutations) {
      expect(mutated, `mutation for ${name} changed nothing`).not.toBe(sql);
      expect(checks(mutated), `mutation for ${name}`).toContain(name);
    }
  });
});

describe('P1675 R7: a hike never schedules a feedback email (send-event-emails source)', () => {
  const src = readFileSync(INDEX, 'utf8');

  function feedbackChecks(code: string): string[] {
    const failed: string[] = [];
    if (!/if \(event\.host_id === FEEDBACK_HOST_ID && !isHike\(event\)\) \{/.test(code)) failed.push('registration path skips hikes');
    if (!/feedbackScheduledAt = event\.host_id === FEEDBACK_HOST_ID && !hikeEvent/.test(code)) failed.push('update path computes none for hikes');
    if (!/if \(!hikeEvent\) \{\s+if \(feedbackScheduledAt && feedbackScheduledAt > now\) \{/.test(code)) failed.push('update leaves the column untouched for hikes');
    if (!/\.select\('id, title, datetime, duration_minutes, timezone, location, description, slug, host_id, series_slug, flow'\)/.test(code)) failed.push('update reads flow');
    // the dispatcher skips a hike before any claim (behaviour is tested in the Deno suite)
    const disp = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'event-dispatch.ts'), 'utf8');
    if (disp.indexOf("return 'skipped:hike'") < 0 || disp.indexOf("return 'skipped:hike'") > disp.indexOf("claimMessage(\n    supabase, rsvp, 'feedback'")) failed.push('dispatcher skips hike before claim');
    // a non-hike still schedules, in both paths
    if (!/update\(\{ feedback_scheduled_at: feedbackScheduledAt\.toISOString\(\) \}\)/.test(code)) failed.push('registration still schedules');
    if (!/updatePayload\.feedback_scheduled_at = feedbackScheduledAt\.toISOString\(\);/.test(code)) failed.push('update still schedules');
    return failed;
  }

  it('meets every contract', () => {
    expect(feedbackChecks(src)).toEqual([]);
  });

  it('each contract fails on a mutated copy of the real file', () => {
    const mutations: Array<[string, string]> = [
      ['registration path skips hikes', src.replace('event.host_id === FEEDBACK_HOST_ID && !isHike(event)) {', 'event.host_id === FEEDBACK_HOST_ID) {')],
      ['update path computes none for hikes', src.replace('FEEDBACK_HOST_ID && !hikeEvent', 'FEEDBACK_HOST_ID')],
      ['update leaves the column untouched for hikes', src.replace('if (!hikeEvent) {', 'if (true) {')],
      ['update reads flow', src.replace(', host_id, series_slug, flow\')', ', host_id\')')],
      ['registration still schedules', src.replace('update({ feedback_scheduled_at: feedbackScheduledAt.toISOString() })', 'update({})')],
      ['update still schedules', src.replace('updatePayload.feedback_scheduled_at = feedbackScheduledAt.toISOString();', '')],
    ];
    for (const [name, mutated] of mutations) {
      expect(mutated, `mutation for ${name} changed nothing`).not.toBe(src);
      expect(feedbackChecks(mutated), `mutation for ${name}`).toContain(name);
    }
  });
});
