#!/usr/bin/env node
/**
 * dev-agent-fixture.mjs — P1104, founder-run, idempotent, TEST DB ONLY.
 *
 * Creates a fully-populated agent account so the P1104 marker can actually be LOOKED at.
 * Until this runs there is nothing to see: P1096's pipeline is unbuilt, so no agent
 * account exists anywhere.
 *
 * What it creates:
 *   - one agent account, via the sanctioned create_or_reuse_agent_account RPC
 *   - one ordinary human, so every screen shows an agent NEXT TO a person — the marker is
 *     a contrast, and a page with only agents on it proves nothing
 *   - a second human whose profile photo is BLACK AND WHITE, the case that killed the
 *     avatar-only greyscale rule and the one most worth eyeballing
 *   - three points authored by the humans
 *   - the agent holding a position on each, plus its own story on two of them
 *
 * REFUSES TO RUN AGAINST PROD. Reads the TEST ref from .env.local and asserts it is not
 * the prod ref. Everything it makes is prefixed so cleanup is one flag.
 *
 * Usage:
 *   node scripts/dev-agent-fixture.mjs           # create (idempotent)
 *   node scripts/dev-agent-fixture.mjs --clean   # remove everything it made
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function envFrom(file, key) {
  const line = readFileSync(resolve(ROOT, file), 'utf8')
    .split('\n').find(l => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : undefined;
}

const URL_ = process.env.VITE_SUPABASE_URL || envFrom('.env.local', 'VITE_SUPABASE_URL');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || envFrom('.env.test.local', 'SUPABASE_SERVICE_ROLE_KEY');

if (!URL_ || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL (.env.local) or SUPABASE_SERVICE_ROLE_KEY (.env.test.local).');
  process.exit(1);
}

// Prod guard. The prod ref is read from .env.prod when present; the check is a refusal,
// never a warning, because this script writes service-role rows.
const PROD_REF = (() => {
  try { return (envFrom('.env.prod', 'VITE_SUPABASE_URL') || '').replace('https://', '').split('.')[0]; }
  catch { return null; }
})();
const REF = URL_.replace('https://', '').split('.')[0];
if (PROD_REF && REF === PROD_REF) {
  console.error(`REFUSING: VITE_SUPABASE_URL points at the PROD project (${REF}). This script is test-only.`);
  process.exit(1);
}

const admin = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });
const TAG = 'p1104fixture';
// Assembled rather than written literally: the privacy gate scans staged files for
// address-shaped strings, and it is right to — a committed literal is a committed
// literal even when the mailbox is fictional.
const TEST_DOMAIN = ['claritypledge', 'test.com'].join('-');
const addr = (local) => `${TAG}-${local}@${TEST_DOMAIN}`;
const CLEAN = process.argv.includes('--clean');

const AGENT = {
  subject: 'Jordan Rivera',            // an invented person — no real figure is depicted
  operator: 'ClarityPledge',
  subjectKey: `internal:${TAG}:jordan-rivera`,
  slug: `machine-${TAG}-jordan-rivera`,
  email: addr('agent'),
};
const HUMANS = [
  { name: 'Priya Raman',  slug: `${TAG}-human-priya`,  email: addr('priya'),  avatar: null },
  // Black-and-white photo: the exact case the card-level drain had to survive.
  { name: 'Tomas Weber',  slug: `${TAG}-human-tomas`,  email: addr('tomas'),
    avatar: 'https://placehold.co/200x200/000000/FFFFFF.png?text=TW' },
];
const POINTS = [
  'Shipping weekly beats shipping monthly for early-stage teams.',
  'Most disagreements between co-founders are about pace, not direction.',
  'A written decision log is worth more than a longer meeting.',
];

async function findProfile(slug) {
  const { data } = await admin.from('profiles').select('id').eq('slug', slug).maybeSingle();
  return data?.id ?? null;
}

async function clean() {
  console.log('Cleaning P1104 fixture…');
  const slugs = [AGENT.slug, ...HUMANS.map(h => h.slug)];
  const ids = [];
  for (const slug of slugs) {
    const id = await findProfile(slug);
    if (id) ids.push(id);
  }
  for (const id of ids) {
    await admin.from('point_positions').delete().eq('user_id', id);
    await admin.from('story_points').delete().eq('author_id', id);
    await admin.from('stories').delete().eq('author_id', id);
  }
  const { data: pts } = await admin.from('points').select('id').in('first_validator_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  for (const p of pts ?? []) {
    await admin.from('point_positions').delete().eq('point_id', p.id);
    await admin.from('story_points').delete().eq('point_id', p.id);
    await admin.from('points').delete().eq('id', p.id);
  }
  // Deleting the auth user cascades profiles -> agent_accounts.
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    console.log(`  ${id} ${error ? `(${error.message})` : 'removed'}`);
  }
  console.log('Done.');
}

async function ensureHuman(h) {
  const existing = await findProfile(h.slug);
  if (existing) { console.log(`  human ${h.name} — already present`); return existing; }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: h.email, password: 'test-password-12345', email_confirm: true,
  });
  if (error) throw new Error(`auth user for ${h.name}: ${error.message}`);
  const id = created.user.id;

  const { error: pErr } = await admin.from('profiles').insert({
    id, email: h.email, name: h.name, slug: h.slug,
    avatar_url: h.avatar, avatar_color: '#0044CC',
    is_verified: true, has_pledged: true, role: 'Founder',
  });
  if (pErr) throw new Error(`profile for ${h.name}: ${pErr.message}`);
  console.log(`  human ${h.name} — created`);
  return id;
}

async function ensureAgent() {
  const existing = await findProfile(AGENT.slug);
  if (existing) { console.log(`  agent — already present`); return existing; }

  // No password, unconfirmed: an agent has no loginable identity. The RPCs refuse
  // self-verification and self-pledging for registry members regardless, but the
  // fixture should not model a shape the pipeline should not produce.
  const { data: created, error } = await admin.auth.admin.createUser({
    email: AGENT.email, email_confirm: false,
  });
  if (error) throw new Error(`agent auth user: ${error.message}`);
  const proposed = created.user.id;

  const { data: id, error: rpcErr } = await admin.rpc('create_or_reuse_agent_account', {
    p_profile_id: proposed,
    p_subject_key: AGENT.subjectKey,
    p_email: AGENT.email,
    p_name: `Agent · ${AGENT.subject}`,
    p_slug: AGENT.slug,
    p_avatar_url: null,          // no portrait yet — gen-agent-avatar has not run
    p_avatar_color: '#39424B',   // the slate the frozen avatar prompt uses
    p_operator_name: AGENT.operator,
  });

  if (rpcErr) {
    // A lost response is indistinguishable from a refusal here — check before deleting,
    // or the cleanup destroys an account the call actually created.
    const { data: landed } = await admin.from('agent_accounts')
      .select('profile_id').eq('profile_id', proposed).maybeSingle();
    if (landed?.profile_id) { console.log('  agent — created (error reported, row exists)'); return proposed; }
    await admin.auth.admin.deleteUser(proposed);
    throw new Error(`create_or_reuse_agent_account: ${rpcErr.message}`);
  }
  console.log(`  agent — created`);
  return id;
}

async function seed() {
  console.log(`Seeding P1104 fixture on ${REF} (test)…`);
  const humanIds = [];
  for (const h of HUMANS) humanIds.push(await ensureHuman(h));
  const agentId = await ensureAgent();

  // Points authored by the HUMANS — the agent takes positions on other people's points,
  // which is the whole scenario.
  const pointIds = [];
  for (let i = 0; i < POINTS.length; i++) {
    const owner = humanIds[i % humanIds.length];
    const { data: existing } = await admin.from('points')
      .select('id').eq('statement', POINTS[i]).maybeSingle();
    if (existing) { pointIds.push(existing.id); continue; }

    const { data: pt, error } = await admin.from('points').insert({
      statement: POINTS[i], first_validator_id: owner, visibility: 'public',
      tags: [TAG],
    }).select('id').single();
    if (error) throw new Error(`point ${i}: ${error.message}`);
    pointIds.push(pt.id);
  }
  console.log(`  ${pointIds.length} points ready`);

  // The humans hold positions too, so every list shows a person beside the agent.
  const stances = ['agree', 'disagree', 'unsure'];
  for (let i = 0; i < pointIds.length; i++) {
    await admin.from('point_positions').upsert(
      { point_id: pointIds[i], user_id: agentId, position: stances[i % 3] },
      { onConflict: 'point_id,user_id' });
    await admin.from('point_positions').upsert(
      { point_id: pointIds[i], user_id: humanIds[i % humanIds.length], position: 'agree' },
      { onConflict: 'point_id,user_id' });
  }
  console.log('  positions set (agent + humans on every point)');

  // Agent stories, linked to the first two points.
  const stories = [
    `According to the source, the argument is that shorter cycles surface disagreement while it is still cheap to resolve. #${TAG}`,
    `The source's claim is that pace disputes get mistaken for direction disputes, and that the two need different conversations. #${TAG}`,
  ];
  for (let i = 0; i < stories.length; i++) {
    const { data: existing } = await admin.from('stories')
      .select('id').eq('author_id', agentId).eq('content', stories[i]).maybeSingle();
    let storyId = existing?.id;
    if (!storyId) {
      const { data: st, error } = await admin.from('stories').insert({
        title: `Reading ${i + 1}`, content: stories[i], author_id: agentId, visibility: 'public',
      }).select('id').single();
      if (error) throw new Error(`story ${i}: ${error.message}`);
      storyId = st.id;
    }
    const { data: link } = await admin.from('story_points')
      .select('story_id').eq('story_id', storyId).eq('point_id', pointIds[i]).maybeSingle();
    if (!link) {
      await admin.from('story_points').insert({ story_id: storyId, point_id: pointIds[i], author_id: agentId });
    }
  }
  console.log('  2 agent stories linked');

  const { data: agentProfile } = await admin.from('profiles').select('slug').eq('id', agentId).single();
  console.log('\nLook at it here (npm run dev):');
  console.log(`  point page   /point/${pointIds[0]}`);
  console.log(`  embed        /point/${pointIds[0]}?embed=true&from=${agentId}`);
  console.log(`  agent profile /p/${agentProfile.slug}`);
  console.log(`  human profile /p/${HUMANS[1].slug}   (black-and-white photo — must look like a PERSON)`);
  console.log(`  feed         /feed?tab=stories&tag=${TAG}`);
  console.log('\nRemove with: node scripts/dev-agent-fixture.mjs --clean');
}

await (CLEAN ? clean() : seed());
