#!/usr/bin/env npx tsx
/**
 * Create an event in the production Supabase database.
 *
 * Usage: npx tsx scripts/create-event.ts events/ai-run-2.json
 *
 * Reads PROD_SUPABASE_SERVICE_ROLE_KEY and PROD_SUPABASE_ANON_KEY from .env.local.
 * No credentials needed on the command line.
 *
 * Prints on success:
 *   SLUG=<slug>
 *   URL=https://claritypledge.com/events/<slug>
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { resolveOrg } from '../src/app/prototypes/events/org-defaults';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Load .env.local
const envFile = resolve(repoRoot, '.env.local');
const env: Record<string, string> = {};
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = 'https://besjtuodziykmjidubzw.supabase.co';
const SERVICE_ROLE_KEY = env['PROD_SUPABASE_SERVICE_ROLE_KEY'];
if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: PROD_SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npx tsx scripts/create-event.ts <json-file>');
  process.exit(1);
}

interface EventInput {
  title: string;
  datetime: string;
  duration_minutes: number;
  timezone: string;
  location: string;
  host_id: string;
  description: string;
  status?: string;
  max_attendees?: number | null;
  /**
   * Organization slug this event belongs to. Omit to take the venue default from
   * docs/events/org-defaults.md. Pass null to create a deliberately unaffiliated
   * ("loose") event.
   */
  org_slug?: string | null;
  /**
   * Venue coordinates. Supply them for any in-person event: they decide whether the
   * event is inside the Chiang Mai radius, and without them the script stops and
   * asks rather than assuming. /publish-run already has these from AllTrails.
   */
  lat?: number;
  lng?: number;
}

const input: EventInput = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));

const required: (keyof EventInput)[] = ['title', 'datetime', 'duration_minutes', 'timezone', 'location', 'host_id', 'description'];
for (const field of required) {
  if (!input[field]) {
    console.error(`ERROR: missing required field: ${field}`);
    process.exit(1);
  }
}

function generateSlug(title: string): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `${titleSlug}-${dateStr}-${randomSuffix}`;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Which community does this event belong to? — docs/events/org-defaults.md.
 *
 * The rule lives in src/app/prototypes/events/org-defaults.ts so the site and this
 * script cannot disagree, and so it is covered by tests. Everything here is the
 * database half: turn a slug into an id, or stop and ask.
 */
const decision = resolveOrg({
  location: input.location,
  ...(input.org_slug !== undefined ? { orgSlug: input.org_slug } : {}),
  coords:
    input.lat !== undefined && input.lng !== undefined
      ? { lat: input.lat, lng: input.lng }
      : null,
});

if (decision.kind === 'ask') {
  // Stop rather than guess. An event filed into the wrong community is silent and is
  // found weeks later by noticing a group page looks wrong; a refusal here is found
  // now, by the person who knows the answer.
  console.error(`ERROR: cannot decide which community this event belongs to — ${decision.why}`);
  console.error('Add "lat" and "lng" for the venue, or set "org_slug" explicitly ("cm", "online", or null for none).');
  process.exit(1);
}

let orgId: string | null = null;
if (decision.kind === 'org') {
  const { data: org, error: orgError } = await supabase
    .from('organization')
    .select('id')
    .eq('slug', decision.slug)
    .maybeSingle();
  if (orgError || !org) {
    console.error(`ERROR: organization "${decision.slug}" not found (${orgError?.message ?? 'no row'})`);
    process.exit(1);
  }
  orgId = org.id;
}

const slug = generateSlug(input.title);

const { data, error } = await supabase.from('events').insert({
  slug,
  title: input.title,
  description: input.description,
  datetime: input.datetime,
  duration_minutes: input.duration_minutes,
  timezone: input.timezone,
  location: input.location,
  host_id: input.host_id,
  status: input.status ?? 'upcoming',
  max_attendees: input.max_attendees ?? null,
  org_id: orgId,
}).select('id, slug').single();

if (error || !data) {
  console.error('ERROR: insert failed:', error?.message ?? 'unknown error');
  process.exit(1);
}

console.log(`ORG=${decision.kind === 'org' ? decision.slug : '(none — loose event)'}  # ${decision.why}`);
console.log(`SLUG=${data.slug}`);
console.log(`URL=https://claritypledge.com/events/${data.slug}`);
