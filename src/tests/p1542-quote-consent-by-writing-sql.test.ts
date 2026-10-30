/**
 * P1542 follow-up, 20261030120000_p1542_quote_consent_by_writing.sql, as text (the unit suite cannot execute SQL; the
 * behaviour runs against TEST in e2e/integration/p1542-quote-consent-by-writing.spec.ts):
 *  - one helper names the series whose close hands quotes over; both close functions use it;
 *  - on such a series an answer save derives quote_ok from the words, ignoring any box value;
 *  - clearing the words rejects the person's review for that close; changed words send it back to pending; a
 *    rejected review is never revived;
 *  - Clarity Night keeps the 20261029200200 rule; nothing is dropped or deleted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261030120000_p1542_quote_consent_by_writing.sql', 'utf8');
// Statements only: comments may name what the file does not do.
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('20261030120000: writing is the consent on a hike', () => {
  it('one helper holds the series list, and both close functions read it', () => {
    expect(code).toMatch(/FUNCTION public\.series_quotes_from_close\(p_series text\)[\s\S]*ARRAY\['social-hike'\]/);
    expect(code.match(/public\.series_quotes_from_close\(/g)!.length).toBeGreaterThanOrEqual(3); // definition + 2 callers
    expect(code).not.toMatch(/v_review_series/); // finish_event_close's old private copy is gone
  });

  it('a hike derives quote_ok from the words on insert and on update; elsewhere the box rule stays', () => {
    expect(code).toMatch(/CASE WHEN v_by_writing THEN v_liked IS NOT NULL ELSE COALESCE\(p_quote_ok, true\) END/);
    expect(code).toMatch(/WHEN v_by_writing THEN v_liked IS NOT NULL\s+WHEN p_quote_ok IS FALSE THEN false\s+ELSE public\.event_feedback\.quote_ok/);
  });

  it('cleared words reject the review of THIS close and person; changed words re-pend it; rejected is never revived', () => {
    expect(code).toMatch(/IF v_liked IS NULL THEN\s+[\s\S]*?UPDATE public\.series_reviews r SET status = 'rejected'\s+WHERE r\.source_event_id = p_event_id AND r\.author_profile_id = v_user AND r\.status <> 'rejected'/);
    expect(code).toMatch(/SET quote = left\(v_liked, 2000\), status = 'pending'\s+WHERE r\.source_event_id = p_event_id AND r\.author_profile_id = v_user AND r\.status <> 'rejected'\s+AND r\.quote IS DISTINCT FROM left\(v_liked, 2000\)/);
  });

  it('same signatures and grants; nothing dropped or deleted', () => {
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_event_feedback\(uuid, smallint, text, text, boolean\) TO authenticated/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.finish_event_close\(uuid\) TO authenticated/);
    expect(code).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });
});

const fixes = readFileSync('supabase/migrations/20261030130000_p1542_quote_consent_review_fixes.sql', 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('20261030130000: the review fixes', () => {
  it('one normalisation helper (space, tab, newline, CR, FF, VT, U+00A0) used by both close functions', () => {
    expect(fixes).toMatch(/FUNCTION public\.p1542_quote_words\(p_text text\)/);
    // The class carries a literal U+00A0 (the file holds the character itself; the regex engine reads it as is).
    expect(fixes).toContain("regexp_replace(p_text, '^[ \\t\\n\\r\\f\\v\u00a0]+|[ \\t\\n\\r\\f\\v\u00a0]+$', '', 'g')");
    expect(fixes).toMatch(/v_liked text := public\.p1542_quote_words\(p_liked\)/);
    expect(fixes).toMatch(/SELECT public\.p1542_quote_words\(f\.liked\), f\.quote_ok INTO v_liked, v_quote_ok/);
  });

  it('the script uses the same trim class and a code-point 2000 cut', () => {
    const script = readFileSync('scripts/lib/series-reviews-core.mjs', 'utf8');
    expect(script).toContain('const QUOTE_TRIM = /^[ \\t\\n\\r\\f\\v\\u00a0]+|[ \\t\\n\\r\\f\\v\\u00a0]+$/g;');
    expect(script).toContain("Array.from((words ?? '').replace(QUOTE_TRIM, '')).slice(0, 2000).join('')");
  });

  it('words added after a finish queue the missed pending review, never over an existing (or rejected) row', () => {
    expect(fixes).toMatch(/RETURNING finished_at IS NOT NULL INTO v_finished/);
    expect(fixes).toMatch(/IF v_finished THEN\s+INSERT INTO public\.series_reviews[\s\S]*?'pending', p_event_id\)\s+ON CONFLICT \(source_event_id, author_profile_id\) WHERE source_event_id IS NOT NULL DO NOTHING/);
  });

  it('set_event_quote_ok refuses on a hike before writing anything', () => {
    const fn = fixes.slice(fixes.indexOf('FUNCTION public.set_event_quote_ok(p_event_id uuid, p_quote_ok boolean, p_clicked_at timestamptz)'));
    const refuse = fn.indexOf("USING ERRCODE = '0A000'");
    expect(refuse).toBeGreaterThan(0);
    expect(fn.slice(0, refuse)).toMatch(/public\.series_quotes_from_close\(e\.series_slug\)/);
    expect(refuse).toBeLessThan(fn.indexOf('INSERT INTO public.event_feedback'));
  });

  it('same signatures and grants; nothing dropped or deleted', () => {
    expect(fixes).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_event_quote_ok\(uuid, boolean, timestamptz\) TO authenticated/);
    expect(fixes).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_event_feedback\(uuid, smallint, text, text, boolean\) TO authenticated/);
    expect(fixes).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });
});
