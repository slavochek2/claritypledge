#!/usr/bin/env node
/**
 * P1055 — create the ten CMP Points (seven dimensions + the P1/P2/P3 triad).
 *
 * Standalone Points, created via REST + service role (no UI path exists —
 * see p1055_norm_measurement_instrument.md "Creation").
 *
 * The ten statements live here as data. This same script runs against both
 * environments so test and prod never diverge by so much as a comma.
 *
 * Usage:
 *   node scripts/archive/migrations/20260813-p1055-cmp-points.mjs --env=test
 *   node scripts/archive/migrations/20260813-p1055-cmp-points.mjs --env=prod --confirm
 *
 * Reads TEST_SUPABASE_SERVICE_ROLE_KEY / PROD_SUPABASE_SERVICE_ROLE_KEY and
 * COPY_PROD_FOUNDER_EMAIL from .env.local. Safe to re-run: aborts if any
 * cmp10-tagged Point already exists in the target environment.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

// ============================================================================
// Env loading
// ============================================================================

const envPath = resolve(repoRoot, '.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const FOUNDER_EMAIL = env.COPY_PROD_FOUNDER_EMAIL;
const MEET_URL = 'https://claritypledge.com/meet';

const ENVS = {
  test: {
    ref: 'gfjctyxqlwexxwsmkakq',
    apiBase: 'https://gfjctyxqlwexxwsmkakq.supabase.co/rest/v1',
    key: env.TEST_SUPABASE_SERVICE_ROLE_KEY,
    siteBase: 'http://localhost:5001',
  },
  prod: {
    ref: 'besjtuodziykmjidubzw',
    apiBase: 'https://besjtuodziykmjidubzw.supabase.co/rest/v1',
    key: env.PROD_SUPABASE_SERVICE_ROLE_KEY,
    siteBase: 'https://claritypledge.com',
  },
};

// ============================================================================
// The ten statements — natural order, D1 -> D7 -> P1 -> P2 -> P3
// ============================================================================

const link = (s) => s.replace('the Clarity Meeting Principle', `the [Clarity Meeting Principle](${MEET_URL})`);

const POINTS = [
  {
    key: 'D1',
    statement: link(
      'In an important conversation, someone who follows the Clarity Meeting Principle becomes more trustworthy in my eyes.'
    ),
    tags: ['cmp10', 'cmp7'],
  },
  {
    key: 'D2',
    statement: link(
      'Working with someone who follows the Clarity Meeting Principle, I would expect less rework and fewer mistakes.'
    ),
    tags: ['cmp10', 'cmp7'],
  },
  {
    key: 'D3',
    statement: link(
      'Following the Clarity Meeting Principle makes it easier to voice a difference in values, opinions or interests honestly.'
    ),
    tags: ['cmp10', 'cmp7'],
  },
  {
    key: 'D4',
    statement: link(
      'In an important, emotionally charged conversation, following the Clarity Meeting Principle strengthens the relationship between the people in it.'
    ),
    tags: ['cmp10', 'cmp7'],
  },
  {
    key: 'D5',
    statement: link(
      'Over time, following the Clarity Meeting Principle reduces the conflicts that get emotionally stuck and go nowhere.'
    ),
    tags: ['cmp10', 'cmp7'],
  },
  {
    key: 'D6',
    statement: link(
      'Following the Clarity Meeting Principle makes it easier to learn from each other despite differences in opinions, interests and values.'
    ),
    tags: ['cmp10', 'cmp7'],
  },
  {
    key: 'D7',
    statement: link(
      'Following the Clarity Meeting Principle makes it less likely that two people leave a conversation with different versions of what was agreed.'
    ),
    tags: ['cmp10', 'cmp7'],
  },
  {
    key: 'P1',
    statement: link(
      'In an important conversation, I believe the other person would prefer that I opt into the Clarity Meeting Principle.'
    ),
    tags: ['cmp10', 'cmp3'],
  },
  {
    key: 'P2',
    statement: link(
      'In an important conversation, I prefer that the other person opts into the Clarity Meeting Principle.'
    ),
    tags: ['cmp10', 'cmp3'],
  },
  {
    key: 'P3',
    statement: link(
      'In an important conversation, someone who opts out of the Clarity Meeting Principle loses nothing in my eyes.'
    ),
    tags: ['cmp10', 'cmp3'],
  },
];

// ============================================================================
// Helpers
// ============================================================================

function log(msg) {
  process.stdout.write(msg + '\n');
}

function abort(msg) {
  process.stderr.write('ABORT: ' + msg + '\n');
  process.exit(1);
}

async function rest(cfg, method, path, body, prefer = 'return=representation') {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path}: HTTP ${res.status} -- ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const envArg = args.find((a) => a.startsWith('--env='))?.split('=')[1];
  const confirmed = args.includes('--confirm');

  if (!envArg || !ENVS[envArg]) {
    abort('pass --env=test or --env=prod');
  }
  if (envArg === 'prod' && !confirmed) {
    abort('prod run requires --confirm (founder approval in the turn it happens)');
  }
  if (!FOUNDER_EMAIL) {
    abort('COPY_PROD_FOUNDER_EMAIL not set in .env.local');
  }

  const cfg = ENVS[envArg];
  if (!cfg.key) {
    abort(`service role key for ${envArg} not set in .env.local`);
  }

  log(`Environment: ${envArg} (${cfg.ref})`);

  // Resolve + verify the creating account
  const profiles = await rest(
    cfg,
    'GET',
    `/profiles?email=eq.${encodeURIComponent(FOUNDER_EMAIL)}&select=id,is_verified`
  );
  if (!profiles || profiles.length === 0) {
    abort(`no profile found for ${FOUNDER_EMAIL} in ${envArg}`);
  }
  const founder = profiles[0];
  if (!founder.is_verified) {
    abort(`profile ${founder.id} in ${envArg} is not verified -- createPoint requires a verified account`);
  }
  log(`Creating account: ${founder.id} (verified)`);

  // Safe to run twice: reuse cmp10 Points if they already exist, otherwise create them
  const existing = await rest(cfg, 'GET', `/points?tags=cs.{cmp10}&select=id,tags,created_at&order=created_at.asc`);
  let pointIds;
  if (existing && existing.length > 0) {
    log(`${existing.length} cmp10-tagged Point(s) already exist in ${envArg} -- skipping creation, staking only`);
    pointIds = existing.map((p) => p.id);
  } else {
    pointIds = [];
    for (const p of POINTS) {
      const [row] = await rest(cfg, 'POST', '/points', {
        statement: p.statement,
        first_validator_id: founder.id,
        tags: p.tags,
      });
      log(`Created ${p.key}: ${row.id}`);
      pointIds.push(row.id);
    }
  }

  // Stake "Strongly Agree" for the founder on all ten -- idempotent (upsert on point_id,user_id)
  // so the feed's zero-position filter (P543, points-service-real.ts) stops hiding them.
  const stakeResults = await rest(
    cfg,
    'POST',
    '/point_positions?on_conflict=point_id,user_id',
    pointIds.map((point_id) => ({ point_id, user_id: founder.id, position: 'strongly_agree' })),
    'return=representation,resolution=merge-duplicates'
  );
  log(`Staked strongly_agree for ${founder.id} on ${stakeResults.length} Point(s)`);

  log('');
  log('Done. Shareable URLs (always include &sort=oldest):');
  log(`  ${cfg.siteBase}/feed?tag=cmp7&sort=oldest`);
  log(`  ${cfg.siteBase}/feed?tag=cmp3&sort=oldest`);
  log(`  ${cfg.siteBase}/feed?tag=cmp10&sort=oldest`);
}

main().catch((err) => abort(err.message));
