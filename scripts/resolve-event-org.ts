#!/usr/bin/env npx tsx
/**
 * Which community does an event belong to? — docs/events/org-defaults.md.
 *
 * For creation paths that write their own INSERT (/publish-run) rather than going
 * through scripts/create-event.ts, which resolves this itself. Same rule, one
 * implementation: src/app/prototypes/events/org-defaults.ts.
 *
 * Usage:
 *   npx tsx scripts/resolve-event-org.ts <location> [lat] [lng]
 *
 * Prints on a decision (exit 0):
 *   ORG_SLUG=cm
 *   ORG_ID=<uuid>          # omitted for a deliberately unaffiliated event
 *   WHY=17 km from Chiang Mai (within 150 km)
 *
 * Exits 1 when a human has to choose — ASK the founder, never pick one.
 *
 * Output contract (.claude/rules/shell-safety.md): no '>', '<' or '|' in any line.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { resolveOrg } from '../src/app/prototypes/events/org-defaults';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const [location, latRaw, lngRaw] = process.argv.slice(2);
if (!location) {
  console.error('usage: npx tsx scripts/resolve-event-org.ts <location> [lat] [lng]');
  process.exit(2);
}

const lat = latRaw === undefined ? undefined : Number(latRaw);
const lng = lngRaw === undefined ? undefined : Number(lngRaw);
if ((lat !== undefined && !Number.isFinite(lat)) || (lng !== undefined && !Number.isFinite(lng))) {
  console.error('ERROR: lat and lng must be numbers');
  process.exit(2);
}

const decision = resolveOrg({
  location,
  coords: lat !== undefined && lng !== undefined ? { lat, lng } : null,
});

if (decision.kind === 'ask') {
  console.error(`ASK: ${decision.why}`);
  console.error('Ask the founder which community this event belongs to, then pass the slug explicitly.');
  process.exit(1);
}

if (decision.kind === 'loose') {
  console.log('ORG_SLUG=');
  console.log(`WHY=${decision.why}`);
  process.exit(0);
}

// Resolve the slug to an id so the caller can put it straight in an INSERT.
const env: Record<string, string> = {};
for (const line of readFileSync(resolve(repoRoot, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const key = env['PROD_SUPABASE_SERVICE_ROLE_KEY'] ?? env['PROD_SUPABASE_ANON_KEY'];
if (!key) {
  console.error('ERROR: no PROD_SUPABASE_SERVICE_ROLE_KEY or PROD_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient('https://besjtuodziykmjidubzw.supabase.co', key);
const { data, error } = await supabase
  .from('organization')
  .select('id')
  .eq('slug', decision.slug)
  .maybeSingle();

if (error || !data) {
  console.error(`ERROR: organization "${decision.slug}" not found (${error?.message ?? 'no row'})`);
  process.exit(1);
}

console.log(`ORG_SLUG=${decision.slug}`);
console.log(`ORG_ID=${data.id}`);
console.log(`WHY=${decision.why}`);
