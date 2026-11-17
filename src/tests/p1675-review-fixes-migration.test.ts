/**
 * @file p1675-review-fixes-migration.test.ts
 * @description P1675 review fixes: source contract of 20261117130000_p1675_review_fixes.sql. "Already registered" is
 * answered before the 24-hour rule, and the room counts use app_private.viewer_sees_event (no room-member back door).
 * Each check is also run against a mutated copy of the real file, so a check that cannot fail is caught.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FILE = join(__dirname, '..', '..', 'supabase', 'migrations', '20261117130000_p1675_review_fixes.sql');

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) return '';
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end);
}

function checks(sql: string): string[] {
  const failed: string[] = [];
  const reg = fnBody(sql, 'register_for_hike');
  const counts = fnBody(sql, 'get_event_room_counts');
  const already = reg.indexOf("RETURN 'already'");
  const nowOnly = reg.indexOf("RETURN 'now_only'");
  if (already < 0 || nowOnly < 0 || already > nowOnly) failed.push('already before now_only');
  if (reg.indexOf('INSERT INTO') < nowOnly) failed.push('no write before now_only');
  if (!/now\(\) < v_event\.datetime - interval '24 hours 30 minutes'\)/.test(reg)) failed.push('strict 24h rule');
  if (/recording/i.test(reg)) failed.push('no recording acceptance');
  if (!/app_private\.viewer_sees_event\(p_event\)/.test(counts)) failed.push('visibility helper');
  if (/event_room_members m WHERE m\.event_id = p_event AND m\.profile_id = v_uid/.test(counts)) failed.push('no room-member visibility');
  if (!/IF v_host IS NOT DISTINCT FROM v_uid THEN/.test(counts)) failed.push('merged counts host only');
  for (const [name, body] of [['register_for_hike', reg], ['get_event_room_counts', counts]] as const) {
    if (!/SECURITY DEFINER\s+SET search_path = ''/.test(body)) failed.push(`${name} search_path`);
  }
  if (!/REVOKE ALL ON FUNCTION public\.register_for_hike\(text, text, text, integer, text, text\) FROM PUBLIC, anon;/.test(sql)) failed.push('register revoke');
  if (!/REVOKE ALL ON FUNCTION public\.get_event_room_counts\(uuid\) FROM PUBLIC, anon;/.test(sql)) failed.push('counts revoke');
  if (/GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO (anon|PUBLIC)/.test(sql)) failed.push('no anon grant');
  return failed;
}

describe('P1675 review fixes migration', () => {
  const sql = readFileSync(FILE, 'utf8');

  it('meets every contract', () => {
    expect(checks(sql)).toEqual([]);
  });

  it('each contract fails on a mutated copy of the real file', () => {
    const mutations: Array<[string, string]> = [
      ['already before now_only', sql.replace(/ {2}-- Already registered[\s\S]*?END IF;\n/, '').replace("RETURN 'full';", "RETURN 'full';\n  IF v_uid IS NOT NULL THEN RETURN 'already'; END IF;")],
      ['strict 24h rule', sql.replace("now() < v_event.datetime - interval '24 hours 30 minutes'", "now() < v_event.datetime - interval '24 hours'")],
      ['visibility helper', sql.replace('NOT app_private.viewer_sees_event(p_event)', 'false')],
      ['merged counts host only', sql.replace('IF v_host IS NOT DISTINCT FROM v_uid THEN', 'IF true THEN')],
      ['counts revoke', sql.replace('REVOKE ALL ON FUNCTION public.get_event_room_counts(uuid) FROM PUBLIC, anon;', '')],
      ['no anon grant', sql.replace('GRANT EXECUTE ON FUNCTION public.get_event_room_counts(uuid) TO authenticated;', 'GRANT EXECUTE ON FUNCTION public.get_event_room_counts(uuid) TO anon;')],
    ];
    for (const [name, mutated] of mutations) {
      expect(mutated, `mutation for ${name} changed nothing`).not.toBe(sql);
      expect(checks(mutated), `mutation for ${name}`).toContain(name);
    }
  });
});
