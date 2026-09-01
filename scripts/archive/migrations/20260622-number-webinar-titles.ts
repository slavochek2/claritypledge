#!/usr/bin/env npx tsx
/**
 * Numbers existing "I've Lost Co-Founders" series events in prod chronologically.
 * Matches "Clarity Experiment #" and bare-title rows and rewrites them to the numbered
 * "Clarity Experiment #N" format, preserving chronological order.
 *
 * Usage:
 *   npx tsx scripts/number-webinar-titles.ts            # dry run
 *   npx tsx scripts/number-webinar-titles.ts --confirm  # updates prod
 *
 * Reads PROD_SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { WEBINAR_SERIES } from '@/app/data/webinar-series';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const envFile = resolve(repoRoot, '.env.local');
const env: Record<string, string> = {};
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SERVICE_ROLE_KEY = env['PROD_SUPABASE_SERVICE_ROLE_KEY'];
if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: PROD_SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient('https://besjtuodziykmjidubzw.supabase.co', SERVICE_ROLE_KEY);

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
