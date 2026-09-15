#!/usr/bin/env npx tsx
/**
 * Numbers existing "I've Lost Co-Founders" series events in prod chronologically.
 * Matches "Clarity Experiment #" and bare-title rows and rewrites them to the numbered
 * "Clarity Experiment #N" format, preserving chronological order.
 *
 * Usage:
 *   npx tsx scripts/archive/migrations/20260622-number-webinar-titles.ts            # dry run
 *   npx tsx scripts/archive/migrations/20260622-number-webinar-titles.ts --confirm  # updates prod
 *
 * Reads the prod service key through the per-access lock (scripts/lib/keyring.mjs, P1316).
 */

import { createClient } from '@supabase/supabase-js';
import { WEBINAR_SERIES } from '@/app/data/webinar-series';

const PROD_URL = 'https://besjtuodziykmjidubzw.supabase.co';

// Archived one-off: kept runnable, not re-run. The dry-run read uses the public anon key
// (`events` is SELECT USING (true)); the prod service key is read through the per-access lock only
// after --confirm (P1316), so a dry run costs no dialog.
const { readFileSync } = await import('fs');
const PROD_ANON_KEY = readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
  .match(/^PROD_SUPABASE_ANON_KEY=["']?([^"'\r\n]+)/m)?.[1];
if (!PROD_ANON_KEY) {
  console.error('ERROR: PROD_SUPABASE_ANON_KEY not found in .env.local');
  process.exit(1);
}
let supabase = createClient(PROD_URL, PROD_ANON_KEY);

// Fetch all series events (past + upcoming) ordered chronologically
const { data: events, error } = await supabase
  .from('events')
  .select('id, slug, title, datetime')
  .eq('host_id', WEBINAR_SERIES.HOST_ID)
  .or(`title.ilike.${WEBINAR_SERIES.TITLE_PREFIX}%,title.ilike.I've Lost Co-Founders%`)
  .order('datetime', { ascending: true });

if (error || !events) {
  console.error('ERROR fetching events:', error?.message ?? 'unknown');
  process.exit(1);
}

console.log(`\nFound ${events.length} series event(s) to number:\n`);
events.forEach((e, i) => {
  const newTitle = `${WEBINAR_SERIES.TITLE_PREFIX}${i + 1}: I've Lost Co-Founders. Here's How to Keep Yours.`;
  console.log(`  #${i + 1}  ${e.datetime.split('T')[0]}  ${newTitle}`);
});

const isConfirm = process.argv.includes('--confirm');
if (!isConfirm) {
  console.log('\n[DRY RUN] Pass --confirm to update prod.\n');
  process.exit(0);
}

// Confirmed: now, and only now, read the prod service key through the per-access lock.
// keyringGet throws on a declined dialog — nothing is updated, no plaintext fallback.
const { keyringGet } = await import('../../lib/keyring.mjs');
supabase = createClient(PROD_URL, keyringGet('PROD_SUPABASE_SERVICE_ROLE_KEY', 'number-webinar-titles (archived migration): rename series events on prod'));

console.log('\nUpdating PROD...\n');
let success = 0;
let failed = 0;

for (const [i, event] of events.entries()) {
  const newTitle = `${WEBINAR_SERIES.TITLE_PREFIX}${i + 1}: I've Lost Co-Founders. Here's How to Keep Yours.`;
  const { error: updateError } = await supabase
    .from('events')
    .update({ title: newTitle })
    .eq('id', event.id);

  if (updateError) {
    console.error(`  FAIL ${event.slug}: ${updateError.message}`);
    failed++;
  } else {
    console.log(`  OK   #${i + 1}  ${event.slug}`);
    success++;
  }
}

console.log(`\nDone: ${success} updated, ${failed} failed.`);
if (failed > 0) process.exit(1);
