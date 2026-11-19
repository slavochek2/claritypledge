/**
 * @file p1675-r19-when-event.test.ts
 * @description P1675 UAT round 4 R19: a hike's third "when" answer. Source contract of 20261119120000_p1675_hike_when_at_event.sql
 * (each check also run against a mutated copy of the real file) and the client's model, labels, host line and lead.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HIKE_WHEN, isValidHikeAnswers } from '@/app/data/hike-answer-model';
import { HIKE_EVENT_OPTION, HIKE_HOST_WHEN, HIKE_LATER_OPTION, HIKE_REQUIRED_AT_EVENT } from '@/app/prototypes/events/components/hike-copy';
import { arrivalLeadMinutes, EARLY_LEAD_MINUTES } from '@/app/prototypes/events/event-doors';

const ROOT = join(__dirname, '..', '..');
const FILE = join(ROOT, 'supabase', 'migrations', '20261119120000_p1675_hike_when_at_event.sql');
const PREVIOUS = join(ROOT, 'supabase', 'migrations', '20261118200000_p1675_hike_registration_preset.sql');

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) return '';
  return sql.slice(start, sql.indexOf('$$;', start));
}

function checks(sql: string): string[] {
  const failed: string[] = [];
  const reg = fnBody(sql, 'register_for_hike');
  if (/^\s*(BEGIN|COMMIT);/m.test(sql)) failed.push('no BEGIN/COMMIT');
  if (!/DROP CONSTRAINT IF EXISTS event_hike_answers_when_choice_check;/.test(sql)) failed.push('drops the old check');
  if (!/ADD CONSTRAINT event_hike_answers_when_choice_check CHECK \(when_choice IN \('now', 'later', 'event'\)\)/.test(sql)) failed.push('widened check');
  if (!/p_when NOT IN \('now', 'later', 'event'\)/.test(reg)) failed.push('function accepts event');
  if (/p_when NOT IN \('now', 'later'\)/.test(reg)) failed.push('no fourth value gap');
  if (!/SECURITY DEFINER\s+SET search_path = ''/.test(reg)) failed.push('search_path');
  if (!/IF p_when = 'later' AND NOT \(now\(\) < v_event\.datetime - interval '24 hours 30 minutes'\) THEN\s+RETURN 'now_only';/.test(reg)) failed.push('24h rule is for later only');
  if (!/REVOKE ALL ON FUNCTION public\.register_for_hike\(text, text, text, integer, text, text\) FROM PUBLIC, anon;/.test(sql)) failed.push('revoke');
  if (!/GRANT EXECUTE ON FUNCTION public\.register_for_hike\(text, text, text, integer, text, text\) TO authenticated;/.test(sql)) failed.push('grant');
  if (/GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO (anon|PUBLIC)/.test(sql)) failed.push('no anon grant');
  return failed;
}

describe('P1675 R19 migration: when_choice accepts event', () => {
  const sql = readFileSync(FILE, 'utf8');

  it('meets every contract', () => {
    expect(checks(sql)).toEqual([]);
  });

  it('each contract fails on a mutated copy of the real file', () => {
    const mutations: Array<[string, string]> = [
      ['drops the old check', sql.replace('DROP CONSTRAINT IF EXISTS', 'DROP CONSTRAINT')],
      ['widened check', sql.replace("IN ('now', 'later', 'event'))", "IN ('now', 'later'))")],
      ['function accepts event', sql.replace("p_when NOT IN ('now', 'later', 'event')", "p_when NOT IN ('now', 'later')")],
      ['search_path', sql.replace("SET search_path = ''", '')],
      ['24h rule is for later only', sql.replace("p_when = 'later' AND NOT", "p_when <> 'now' AND NOT")],
      ['revoke', sql.replace('FROM PUBLIC, anon;', 'FROM PUBLIC;')],
      ['grant', sql.replace('TO authenticated;', 'TO anon;')],
      ['no BEGIN/COMMIT', `BEGIN;\n${sql}`],
    ];
    for (const [name, mutated] of mutations) {
      expect(mutated).not.toBe(sql);
      expect(checks(mutated), name).toContain(name);
    }
  });

  it('changes only the p_when validation of the previous function body', () => {
    const prev = fnBody(readFileSync(PREVIOUS, 'utf8'), 'register_for_hike');
    const next = fnBody(sql, 'register_for_hike');
    expect(next.replace("p_when NOT IN ('now', 'later', 'event')", "p_when NOT IN ('now', 'later')")).toBe(prev);
  });
});

describe('P1675 R19 client', () => {
  it('offers three answers, event valid, a fourth refused', () => {
    expect(HIKE_WHEN).toEqual(['now', 'later', 'event']);
    const a = { when: 'event', transport: 'bike_or_foot', freeSeats: null, help: null, helpOther: null };
    expect(isValidHikeAnswers(a, { transport: true, help: true })).toBe(true);
    expect(isValidHikeAnswers({ ...a, when: 'never' }, { transport: true, help: true })).toBe(false);
  });
  it('says the approved words', () => {
    expect(HIKE_EVENT_OPTION).toBe("At the meeting point. I'll come 15 minutes early.");
    expect(HIKE_LATER_OPTION).toBe("I'll do it later, remind me by email");
    expect(HIKE_HOST_WHEN.event).toBe('At the meeting point');
    expect(HIKE_REQUIRED_AT_EVENT).toBe("Required for this hike. You'll do it at the meeting point.");
  });
  it('a hike arrives 15 minutes early', () => {
    expect(arrivalLeadMinutes({ seriesSlug: 'social-hike' } as never)).toBe(EARLY_LEAD_MINUTES);
  });
});
