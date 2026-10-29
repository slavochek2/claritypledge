#!/usr/bin/env node
/**
 * P1542: the founder's moderation queue for series reviews (hike pages). A finished hike close with
 * "what was good" and "you may quote me" ticked creates a PENDING review; nothing pending is ever
 * public. This is the only way a review goes live. Founder-only by construction: it holds the
 * service role (prod: through the per-access keyring lock, one dialog per run), and there is no
 * moderation UI in the app.
 *
 * Usage:
 *   node scripts/series-reviews.mjs list    [--status pending|approved|rejected|all] [--env prod|test]
 *   node scripts/series-reviews.mjs approve <review-id> [--env prod|test]
 *   node scripts/series-reviews.mjs reject  <review-id> [--env prod|test]
 *
 * Default env is prod (like event-close-results.sh); test reads the service role from .env.test.local.
 * `list` defaults to pending. Approving puts the review last in its series' order. A rejected review
 * is kept (never deleted), so the same close cannot produce a second one.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROD_URL = 'https://besjtuodziykmjidubzw.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  if (i === -1) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const env = flag('--env', 'prod');
const status = flag('--status', 'pending');
const [cmd, id] = args;

function usage(msg) {
  if (msg) console.error(msg);
  console.error('Usage: series-reviews.mjs list [--status pending|approved|rejected|all] | approve <id> | reject <id>   [--env prod|test]');
  process.exit(1);
}
if (!['list', 'approve', 'reject'].includes(cmd)) usage();
if (!['prod', 'test'].includes(env)) usage('--env must be prod or test');
if (cmd !== 'list' && !UUID.test(id ?? '')) usage('approve/reject need the full review id (run list first)');
if (!['pending', 'approved', 'rejected', 'all'].includes(status)) usage('bad --status');

async function client() {
  if (env === 'prod') {
    const { keyringGet } = await import('./lib/keyring.mjs');
    const key = keyringGet('PROD_SUPABASE_SERVICE_ROLE_KEY', `series-reviews: ${cmd} on prod`);
    return createClient(PROD_URL, key);
  }
  const vars = Object.fromEntries(
    readFileSync(join(ROOT, '.env.test.local'), 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
  );
  if (!vars.VITE_SUPABASE_URL || !vars.SUPABASE_SERVICE_ROLE_KEY) usage('.env.test.local lacks the test URL or service role key');
  return createClient(vars.VITE_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);
}

// Attendee text is untrusted: control characters (terminal escapes) never reach the terminal.
const clean = (v) => (v == null ? '-' : String(v).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '?').replace(/\n/g, '\n    '));

const db = await client();

/**
 * Is the review still what the person agreed to? A review made by a close points at its feedback row
 * (source_event_id + author_profile_id). The person can still edit that row after the close, so approval
 * needs quote_ok still true and the words unchanged. Hand-added reviews (no source) are not checked.
 * Returns null when fine, else a short reason.
 */
async function consentProblem(r) {
  if (!r.source_event_id || !r.author_profile_id) return null;
  const { data: fb, error } = await db.from('event_feedback').select('liked, quote_ok')
    .eq('event_id', r.source_event_id).eq('user_id', r.author_profile_id).maybeSingle();
  if (error) return `could not check consent (${error.message})`;
  if (!fb || !fb.quote_ok) return 'consent withdrawn';
  // The hand-off stored the first 2000 characters of the trimmed words.
  if ((fb.liked ?? '').trim().slice(0, 2000) !== r.quote) return 'text changed';
  return null;
}
console.log(`[${env}]`);

if (cmd === 'list') {
  let q = db.from('series_reviews')
    .select('id, series_slug, quote, author_name, status, created_at, sort_order, source_event_id, author_profile_id, author:profiles!series_reviews_author_profile_id_fkey (slug)')
    .order('created_at', { ascending: true });
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) { console.error('query failed:', error.message); process.exit(2); }
  console.log(`${data.length} ${status} review(s)`);
  for (const r of data) {
    const profile = Array.isArray(r.author) ? r.author[0] : r.author;
    const problem = r.status === 'pending' ? await consentProblem(r) : null;
    console.log(`\n${r.id}  [${r.status}]${problem ? ` [${problem}]` : ''} ${clean(r.series_slug)}  ${r.created_at.slice(0, 10)}`);
    console.log(`  ${clean(r.author_name)}${profile?.slug ? `  (/p/${clean(profile.slug)})` : ''}`);
    console.log(`  "${clean(r.quote)}"`);
  }
} else {
  const next = cmd === 'approve' ? 'approved' : 'rejected';
  const { data: row, error: readErr } = await db.from('series_reviews').select('id, series_slug, status, author_name, quote, source_event_id, author_profile_id').eq('id', id).maybeSingle();
  if (readErr) { console.error('read failed:', readErr.message); process.exit(2); }
  if (!row) { console.error('no review with that id'); process.exit(1); }
  if (next === 'approved') {
    const problem = await consentProblem(row);
    if (problem) {
      console.error(`REFUSED: ${problem} for this review. The person changed their feedback after the close, so approving would publish words they did not agree to. Run: reject ${row.id}`);
      process.exit(3);
    }
  }
  const patch = { status: next };
  if (next === 'approved') {
    const { data: last } = await db.from('series_reviews').select('sort_order').eq('series_slug', row.series_slug).eq('status', 'approved').order('sort_order', { ascending: false }).limit(1);
    patch.sort_order = (last?.[0]?.sort_order ?? -1) + 1;
  }
  const { error } = await db.from('series_reviews').update(patch).eq('id', id);
  if (error) { console.error('update failed:', error.message); process.exit(2); }
  console.log(`${clean(row.author_name)}: ${row.status} -> ${next}`);
}
