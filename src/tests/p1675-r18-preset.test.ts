/**
 * @file p1675-r18-preset.test.ts
 * @description P1675 UAT round 3 R18: the hike's one "before the seat" preset. Source contract of
 * 20261118200000_p1675_hike_registration_preset.sql (each check also run against a mutated copy of the real file), the shared
 * "form first" decision used after sign-up (a signed-out person who reserves an optional hike is sent to the one-tap path),
 * and the EventDetail / EventClosePage wiring.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEventBySlug = vi.fn();
vi.mock('@/app/data/events-service', () => ({ eventsService: { getEventBySlug: (...a: unknown[]) => getEventBySlug(...a) } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { eventAsksBeforeSeat } from '@/app/data/event-registration';

const ROOT = join(__dirname, '..', '..');
const FILE = join(ROOT, 'supabase', 'migrations', '20261118200000_p1675_hike_registration_preset.sql');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) return '';
  return sql.slice(start, sql.indexOf('$$;', start));
}

function checks(sql: string): string[] {
  const failed: string[] = [];
  const reg = fnBody(sql, 'register_for_hike');
  const trg = fnBody(sql, '_event_rsvps_need_answers');
  if (/^\s*(BEGIN|COMMIT);/m.test(sql)) failed.push('no BEGIN/COMMIT');
  if (!/ADD COLUMN IF NOT EXISTS hike_registration text NOT NULL DEFAULT 'all'/.test(sql)) failed.push('column and default');
  if (!/CHECK \(hike_registration IN \('optional', 'when', 'when_transport', 'all'\)\)/.test(sql)) failed.push('check constraint');
  if (!/COMMENT ON COLUMN public\.events\.hike_registration/.test(sql)) failed.push('column comment');
  if (!/WHEN hike_asks_transport AND hike_asks_help THEN 'all'/.test(sql)) failed.push('backfill both on');
  if (!/WHEN hike_asks_transport AND NOT hike_asks_help THEN 'when_transport'/.test(sql)) failed.push('backfill transport only');
  if (!/WHEN NOT hike_asks_transport AND NOT hike_asks_help THEN 'when'/.test(sql)) failed.push('backfill neither');
  if (!/ELSE 'all'/.test(sql)) failed.push('backfill help only');
  // Review fix (Gemini, Codex, GLM): the backfill runs only while both booleans exist, so a re-run is a no-op.
  if (!/WHERE table_schema = 'public' AND table_name = 'events'\s+AND column_name IN \('hike_asks_transport', 'hike_asks_help'\)\) = 2 THEN\s+EXECUTE \$backfill\$\s+UPDATE public\.events SET hike_registration/.test(sql)) failed.push('backfill guarded for a re-run');
  // Review fix (Opus): rows already at the default are not rewritten, and the asked_help comment names the preset.
  if (!/END\s+WHERE NOT \(hike_asks_transport AND hike_asks_help\)\s+\$backfill\$/.test(sql)) failed.push('backfill skips rows at the default');
  if (!/COMMENT ON COLUMN public\.event_hike_answers\.asked_help IS\s+'[^']*events\.hike_registration was ''all''/.test(sql)) failed.push('asked_help comment names the preset');
  if (!/DROP COLUMN IF EXISTS hike_asks_transport,\s+DROP COLUMN IF EXISTS hike_asks_help/.test(sql)) failed.push('drops both booleans');
  if (sql.indexOf('DROP COLUMN IF EXISTS hike_asks_transport') < sql.indexOf('_event_rsvps_need_answers')) failed.push('drop after the functions');
  if (/v_event\.hike_asks_/.test(reg) || /hike_asks_/.test(trg)) failed.push('functions no longer read the booleans');
  // register_for_hike
  if (!/SECURITY DEFINER\s+SET search_path = ''/.test(reg)) failed.push('search_path');
  const optional = reg.indexOf("RETURN 'optional'");
  if (!/IF v_event\.hike_registration = 'optional' THEN/.test(reg) || optional < 0) failed.push('optional return code');
  if (optional > reg.indexOf("RETURN 'already'") || optional > reg.indexOf('INSERT INTO public.event_hike_answers') || optional < reg.indexOf("RETURN 'cancelled'")) failed.push('optional after cancelled, before any write');
  if (!/v_asks_transport := v_event\.hike_registration IN \('when_transport', 'all'\);/.test(reg)) failed.push('transport from preset');
  if (!/v_asks_help := v_event\.hike_registration = 'all';/.test(reg)) failed.push('help from preset');
  if (!/v_transport := NULL;\s+v_seats := NULL;/.test(reg)) failed.push('transport not asked stores NULL');
  if (!/v_help := NULL;\s+v_other := NULL;/.test(reg)) failed.push('help not asked stores NULL');
  if (!/v_other, v_asks_help\)/.test(reg)) failed.push('asked_help from the preset');
  if (!/now\(\) < v_event\.datetime - interval '24 hours 30 minutes'\)/.test(reg)) failed.push('strict 24h rule');
  if (!/REVOKE ALL ON FUNCTION public\.register_for_hike\(text, text, text, integer, text, text\) FROM PUBLIC, anon;/.test(sql)) failed.push('revoke');
  if (!/GRANT EXECUTE ON FUNCTION public\.register_for_hike\(text, text, text, integer, text, text\) TO authenticated;/.test(sql)) failed.push('grant');
  if (/GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO (anon|PUBLIC)/.test(sql)) failed.push('no anon grant');
  // seat trigger: hike branch keyed on the preset, mastermind branch kept
  if (!/SELECT e\.hike_registration FROM public\.events e WHERE e\.id = NEW\.event_id\) <> 'optional'/.test(trg)) failed.push('trigger keyed on the preset');
  if (!/this event asks a few questions before registering/.test(trg) || !/this event is full/.test(trg)) failed.push('mastermind branch kept');
  return failed;
}

describe('P1675 R18 migration: hike_registration preset', () => {
  const sql = readFileSync(FILE, 'utf8');

  it('meets every contract', () => {
    expect(checks(sql)).toEqual([]);
  });

  it('each contract fails on a mutated copy of the real file', () => {
    const mutations: Array<[string, string]> = [
      ['column and default', sql.replace("text NOT NULL DEFAULT 'all'", "text NOT NULL DEFAULT 'when'")],
      ['check constraint', sql.replace("('optional', 'when', 'when_transport', 'all'))", "('when', 'all'))")],
      ['backfill both on', sql.replace("WHEN hike_asks_transport AND hike_asks_help THEN 'all'", "WHEN hike_asks_transport AND hike_asks_help THEN 'when'")],
      ['backfill transport only', sql.replace("THEN 'when_transport'", "THEN 'when'")],
      ['backfill neither', sql.replace("WHEN NOT hike_asks_transport AND NOT hike_asks_help THEN 'when'", "WHEN NOT hike_asks_transport AND NOT hike_asks_help THEN 'all'")],
      ['backfill help only', sql.replace("ELSE 'all'", "ELSE 'when'")],
      ['drops both booleans', sql.replace('DROP COLUMN IF EXISTS hike_asks_help', '')],
      ['optional return code', sql.replace("RETURN 'optional';", 'NULL;')],
      ['transport from preset', sql.replace("IN ('when_transport', 'all');", "IN ('all');")],
      ['help from preset', sql.replace("v_event.hike_registration = 'all';", "v_event.hike_registration <> 'when';")],
      ['asked_help from the preset', sql.replace('v_other, v_asks_help)', 'v_other, true)')],
      ['trigger keyed on the preset', sql.replace("e.id = NEW.event_id) <> 'optional'", "e.id = NEW.event_id) <> 'zzz'")],
      ['mastermind branch kept', sql.replace('this event is full', 'full')],
      ['no BEGIN/COMMIT', `BEGIN;\n${sql}\nCOMMIT;`],
      ['backfill guarded for a re-run', sql.replace("table_name = 'events'", "table_name = 'eventz'")],
      ['backfill guarded for a re-run', sql.replace("'hike_asks_help')) = 2 THEN", "'hike_asks_help')) >= 0 THEN\n    NULL;\n  END IF;\n  IF true THEN")],
      ['backfill skips rows at the default', sql.replace('WHERE NOT (hike_asks_transport AND hike_asks_help)', '')],
      ['asked_help comment names the preset', sql.replace("events.hike_registration was ''all''", 'events.hike_asks_help')],
    ];
    for (const [name, mutated] of mutations) {
      expect(mutated, `mutation for ${name} changed nothing`).not.toBe(sql);
      expect(checks(mutated), `mutation for ${name}`).toContain(name);
    }
  });
});

describe('P1675 R18: the form-first decision after sign-up', () => {
  beforeEach(() => getEventBySlug.mockReset());
  const hike = { slug: 'h', seriesSlug: 'social-hike', flow: 'social-hike' };

  it('an optional hike is one tap (not ?action=rsvp); every other preset asks first', async () => {
    getEventBySlug.mockResolvedValue({ ...hike, hikeRegistration: 'optional' });
    expect(await eventAsksBeforeSeat('h')).toBe(false);
    for (const p of ['when', 'when_transport', 'all']) {
      getEventBySlug.mockResolvedValue({ ...hike, hikeRegistration: p });
      expect(await eventAsksBeforeSeat('h')).toBe(true);
    }
  });

  it('the mastermind still asks and Clarity Night is still one tap', async () => {
    getEventBySlug.mockResolvedValue({ slug: 'm', flow: 'sales-mastermind' });
    expect(await eventAsksBeforeSeat('m')).toBe(true);
    getEventBySlug.mockResolvedValue({ slug: 'n', flow: 'clarity-night' });
    expect(await eventAsksBeforeSeat('n')).toBe(false);
  });
});

describe('P1675 R18: every "form first" site uses the shared helper', () => {
  it('EventDetail: asksBeforeSeat is the shared helper and the hike form shows only when asked', () => {
    const src = read('src/app/prototypes/events/components/EventDetail.tsx');
    expect(src).toMatch(/const asksBeforeSeat = eventAsksBeforeSeatSync\(event\)/);
    expect(src).toMatch(/\{hikeAsksBeforeSeat\(event\) && \(\s*<HikeRegistrationQuestions/);
    expect(src).not.toMatch(/const asksBeforeSeat = !!registrationKind/);
  });

  it('the thank-you next-event offer and the sign-in return use it', () => {
    expect(read('src/app/prototypes/events/close/EventClosePage.tsx')).toMatch(/if \(eventAsksBeforeSeatSync\(nextEvent\)\) return navigate/);
    expect(read('src/app/prototypes/events/components/use-registration-return.ts')).toMatch(/if \(hikeAsksBeforeSeat\(event\)\) \{/);
    expect(read('src/app/data/event-registration.ts')).toMatch(/eventAsksBeforeSeatSync\(event\)/);
  });

  it('the answer data model imports no prototype code; the form-first helper lives beside the recipes (review fix)', () => {
    // Layering only: the recipes reach the entry bundle through App's static imports anyway (review round 2, Opus).
    expect(read('src/app/data/registration-draft.ts')).toMatch(/from '\.\/hike-answer-model'/);
    expect(read('src/app/data/hike-answer-model.ts')).not.toMatch(/(from|import\()\s*['"][^'"]*prototypes/);
    expect(read('src/app/data/event-registration.ts')).toMatch(/import\('@\/app\/prototypes\/events\/form-first'\)/);
  });

  it('no site decides form-first from the recipe registration alone', () => {
    for (const f of ['src/app/data/event-registration.ts', 'src/app/prototypes/events/close/EventClosePage.tsx', 'src/app/prototypes/events/components/use-registration-return.ts']) {
      expect(read(f), f).not.toMatch(/recipeForEvent\([^)]*\)\.registration\)/);
    }
  });
});
