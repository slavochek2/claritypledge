/**
 * The founder's moderation steps for series reviews (scripts/series-reviews.mjs), with the database client passed in
 * so the approve race can be tested deterministically (src/tests/p1542-series-reviews-approve.test.ts).
 */

// The words as the database stores a review's quote (20261030130000, public.p1542_quote_words + left(…, 2000)): the same
// trim class (space, \t \n \r \f \v, U+00A0) and the same 2000-character cut, counted by code point as left() does.
const QUOTE_TRIM = /^[ \t\n\r\f\v\u00a0]+|[ \t\n\r\f\v\u00a0]+$/g;
export const asStoredQuote = (words) => Array.from((words ?? '').replace(QUOTE_TRIM, '')).slice(0, 2000).join('');

/**
 * Is the review still what the person agreed to? A review made by a close points at its feedback row
 * (source_event_id + author_profile_id). The person can still edit that row after the close, so approval
 * needs quote_ok still true and the words unchanged. Hand-added reviews (no source) are not checked.
 * Returns null when fine, else a short reason.
 */
export async function consentProblem(db, r) {
  if (!r.source_event_id || !r.author_profile_id) return null;
  const { data: fb, error } = await db.from('event_feedback').select('liked, quote_ok')
    .eq('event_id', r.source_event_id).eq('user_id', r.author_profile_id).maybeSingle();
  if (error) return `could not check consent (${error.message})`;
  if (!fb || !fb.quote_ok) return 'consent withdrawn';
  if (asStoredQuote(fb.liked) !== r.quote) return 'text changed';
  return null;
}

/**
 * Approve or reject one review. Returns { code, out, err }: code 0 done, 1 no such review, 2 a database error,
 * 3 refused by the consent check, 4 refused because the review changed between the check and the write.
 */
export async function moderate(db, id, cmd) {
  const next = cmd === 'approve' ? 'approved' : 'rejected';
  const { data: row, error: readErr } = await db.from('series_reviews').select('id, series_slug, status, author_name, quote, source_event_id, author_profile_id').eq('id', id).maybeSingle();
  if (readErr) return { code: 2, err: `read failed: ${readErr.message}` };
  if (!row) return { code: 1, err: 'no review with that id' };
  if (next === 'approved') {
    const problem = await consentProblem(db, row);
    if (problem) {
      return { code: 3, err: `REFUSED: ${problem} for this review. The person changed their feedback after the close, so approving would publish words they did not agree to. Run: reject ${row.id}` };
    }
  }
  const patch = { status: next };
  if (next === 'approved') {
    const { data: last } = await db.from('series_reviews').select('sort_order').eq('series_slug', row.series_slug).eq('status', 'approved').order('sort_order', { ascending: false }).limit(1);
    patch.sort_order = (last?.[0]?.sort_order ?? -1) + 1;
  }
  // Conditional on what was checked (Opus/Codex review): a clear or an edit landing between the check above and this
  // write changes the row's status or quote, so the write matches nothing instead of publishing words nobody approved.
  let write = db.from('series_reviews').update(patch).eq('id', id);
  if (next === 'approved') write = write.eq('status', 'pending').eq('quote', row.quote);
  const { data: changed, error } = await write.select('id');
  if (error) return { code: 2, err: `update failed: ${error.message}` };
  if (!changed?.length) {
    return { code: 4, err: 'REFUSED: the review changed while it was being approved (now not pending, or new words). Nothing was published. Run list again.' };
  }
  return { code: 0, out: `${row.author_name}: ${row.status} -> ${next}`, row };
}
