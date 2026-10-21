#!/usr/bin/env node
/**
 * seed-p1508-canvas.mjs — P1508, idempotent, TEST DB ONLY (service role).
 *
 * Puts the founder's Clarity Canvas on the test database from the playground decomposition
 * (superdesign-playground/clarity-canvas/data-v9.js): its points, and its stories, under ONE
 * account. Box tags are system tags, which only the service role may write — this script is the
 * only writer of box tags in P1508.
 *
 * What it writes, under the owner's account:
 *   - every point, with the project tag (user tag), its box tag and the canvas's reserved
 *     `canvas_<tag>` tag (system tags; sixth round R9: the canvas reads the reserved tag). A point
 *     seeded before R9 gets the reserved tag added; nothing else about it changes;
 *     exactly ONE point private (`--private`, default the cost-structure point), the rest public
 *   - the owner's own position on each point
 *   - the owner's stories, linked to their points. story_points is UNIQUE(author_id, point_id),
 *     so a point gets the FIRST of the owner's stories it lists; a story whose only point is
 *     private is private too
 *   - nothing for the three ikigai boxes (they start empty)
 *
 * Stories by other people in the data file are NOT seeded: they are not the owner's words,
 * and the founder asked for everything under one account.
 *
 * RUNS ONLY AGAINST THE TEST PROJECT (an allowlisted ref; anything else is refused).
 *
 * Usage:
 *   node scripts/seed-p1508-canvas.mjs                       # seed (idempotent)
 *   node scripts/seed-p1508-canvas.mjs --data <data-v9.js> --slug <owner-slug> --tag <projectTag>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function envFrom(file, key) {
  const line = readFileSync(resolve(ROOT, file), 'utf8').split('\n').find(l => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : undefined;
}

const DATA = arg('data', resolve(homedir(), 'Projects/public/superdesign-playground/clarity-canvas/data-v9.js'));
const SLUG = arg('slug', 'slava');
const TAG = arg('tag', 'claritypledge');
const PRIVATE_POINT = arg('private', 'pt_costs');
const DATA_OWNER = 'user_slava'; // the data file's id for the canvas owner

const URL_ = process.env.VITE_SUPABASE_URL || envFrom('.env.local', 'VITE_SUPABASE_URL');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envFrom('.env.test.local', 'SUPABASE_SERVICE_ROLE_KEY');
if (!URL_ || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL (.env.local) or SUPABASE_SERVICE_ROLE_KEY (.env.test.local).');
  process.exit(1);
}
// An allowlist, not a prod denylist: a worktree has no .env.prod to compare against, and a
// denylist that cannot read its list would have to fail open or refuse every run.
const TEST_REF = 'gfjctyxqlwexxwsmkakq'; // the test project (db-access.md)
const REF = URL_.replace('https://', '').split('.')[0];
if (REF !== TEST_REF) {
  console.error(`REFUSING: ${REF} is not the test project (${TEST_REF}). This script is test-only.`);
  process.exit(1);
}

// The data file assigns to `window.*`; evaluate it in an empty context with only a `window`.
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(DATA, 'utf8'), sandbox, { filename: DATA, timeout: 1000 });
const { POINTS, STORIES } = sandbox.window;
if (!POINTS || !STORIES) { console.error(`No POINTS/STORIES in ${DATA}`); process.exit(1); }
const points = Object.values(POINTS);
if (!points.some(p => p.id === PRIVATE_POINT)) { console.error(`--private ${PRIVATE_POINT} is not a point in the data`); process.exit(1); }

// src/lib/canvas-boxes.ts is the source of truth (this script cannot import TypeScript). Sixth round
// R1 dropped `canvas:uvp`: a data point still in it is skipped, and moves box only on founder approval.
const BOX_TAGS = new Set(['canvas:problem', 'canvas:segments', 'canvas:solution', 'canvas:channels',
  'canvas:revenue', 'canvas:cost', 'canvas:metrics', 'canvas:advantage', 'canvas:love', 'canvas:good-at', 'canvas:world-needs']);
const CANVAS_TAG = `canvas_${TAG.toLowerCase()}`;

const admin = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function seed() {
  console.log(`Seeding the P1508 canvas on ${REF} (test): owner /p/${SLUG}, #${TAG}, private: ${PRIVATE_POINT}`);
  const owner = await must('owner', admin.from('profiles').select('id, slug').eq('slug', SLUG).maybeSingle());
  if (!owner) throw new Error(`no profile with slug ${SLUG}`);

  const pointIdOf = new Map(); // data id: db id
  for (const p of points) {
    const box = (p.tags || []).find(t => BOX_TAGS.has(t));
    if (!box) { console.log(`  skip ${p.id}: no box tag`); continue; }
    const visibility = p.id === PRIVATE_POINT ? 'private' : 'public';
    const existing = await must(`find ${p.id}`, admin.from('points').select('id, visibility, system_tags')
      .eq('first_validator_id', owner.id).eq('statement', p.text).contains('tags', [TAG]).maybeSingle());
    if (existing) {
      pointIdOf.set(p.id, existing.id);
      const tags = existing.system_tags ?? [];
      if (!tags.includes(CANVAS_TAG)) {
        await must(`canvas tag ${p.id}`, admin.from('points').update({ system_tags: [...tags, CANVAS_TAG] }).eq('id', existing.id));
      }
      continue;
    }
    const row = await must(`insert ${p.id}`, admin.from('points').insert({
      statement: p.text, first_validator_id: owner.id, visibility, tags: [TAG], system_tags: [box, CANVAS_TAG],
    }).select('id').single());
    pointIdOf.set(p.id, row.id);
  }
  console.log(`  ${pointIdOf.size} points ready`);

  for (const p of points) {
    const own = p.positions?.[DATA_OWNER]?.position;
    const id = pointIdOf.get(p.id);
    if (!own || !id) continue;
    // Never overwrite a position the owner has since changed (database.md — seeds never override).
    await must(`position ${p.id}`, admin.from('point_positions').upsert(
      { point_id: id, user_id: owner.id, position: own },
      { onConflict: 'point_id,user_id', ignoreDuplicates: true }));
  }
  console.log('  owner positions set');

  // One owner story per point (UNIQUE(author_id, point_id)): the first the point lists.
  const links = []; // [storyDataId, pointDataId]
  for (const p of points) {
    const first = (p.linkedStoryIds || []).find(sid => STORIES[sid]?.authorId === DATA_OWNER);
    if (first && pointIdOf.has(p.id)) links.push([first, p.id]);
  }
  const storyIdOf = new Map();
  for (const sid of new Set(links.map(([s]) => s))) {
    const s = STORIES[sid];
    const linkedHere = links.filter(([x]) => x === sid).map(([, pid]) => pid);
    const visibility = linkedHere.every(pid => pid === PRIVATE_POINT) ? 'private' : 'public';
    const existing = await must(`find ${sid}`, admin.from('stories').select('id')
      .eq('author_id', owner.id).eq('content', s.text).maybeSingle());
    const id = existing?.id ?? (await must(`insert ${sid}`, admin.from('stories').insert({
      content: s.text, author_id: owner.id, visibility,
    }).select('id').single())).id;
    storyIdOf.set(sid, id);
  }
  for (const [sid, pid] of links) {
    const exists = await must('find link', admin.from('story_points').select('story_id')
      .eq('author_id', owner.id).eq('point_id', pointIdOf.get(pid)).maybeSingle());
    if (exists) continue;
    await must(`link ${sid}`, admin.from('story_points').insert({
      story_id: storyIdOf.get(sid), point_id: pointIdOf.get(pid), author_id: owner.id,
    }));
  }
  const skipped = Object.values(STORIES).filter(s => s.authorId !== DATA_OWNER).map(s => s.id);
  console.log(`  ${storyIdOf.size} owner stories, ${links.length} links; not seeded (other authors): ${skipped.join(', ') || 'none'}`);
  console.log(`\nOpen: /p/${SLUG}/canvas/${TAG}`);
}

await seed();
