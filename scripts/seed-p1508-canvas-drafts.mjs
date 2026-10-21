#!/usr/bin/env node
/**
 * seed-p1508-canvas-drafts.mjs — P1508 sixth round R8, idempotent, TEST DB ONLY (service role).
 *
 * Loads the founder's reviewed canvas drafts (markdown kept in the gitignored .private/canvases/)
 * onto the test database, so they can be reviewed as real canvas pages before anything reaches
 * prod. One file is one canvas; its name is the canvas name (`canvas_<name>`, R9).
 *
 * Draft format, per point:
 *   ### <box>                      (love, good-at, world-needs, segments, problem, solution,
 *   - point: <statement>             advantage, channels, metrics, revenue, cost)
 *     story: <text | NO SOURCE FOUND>
 *     source: <review-only, never written>
 *     reused_story_id: <uuid | ->
 *
 * What it writes, under the owner's account:
 *   - each NEW point, public, with the canvas name as its user tag and its box tag + `canvas_<name>`
 *     as system tags. A point that already exists (same owner, same statement) is reused: it gains
 *     `canvas_<name>`, its box tag is replaced when different (the drafts were reviewed for boxes),
 *     and its user tags stay as they are (a second hashtag pill would show on every canvas)
 *   - the owner's position (agree) on every point, never overwriting one already taken
 *   - the owner's story for each point: an existing story when `reused_story_id` is a uuid, else
 *     a new public story with the draft's text; NO SOURCE FOUND writes nothing. story_points is
 *     UNIQUE(author_id, point_id): a point that already has an owner story keeps it
 *   - never a `source:` line, which is review material only
 *
 * Usage:
 *   node scripts/seed-p1508-canvas-drafts.mjs --file <draft.md> --name <canvas name> [--slug slava] [--dry]
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function envFrom(file, key) {
  if (!existsSync(resolve(ROOT, file))) return undefined;
  const line = readFileSync(resolve(ROOT, file), 'utf8').split('\n').find(l => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : undefined;
}

const FILE = arg('file');
const NAME = (arg('name') || '').toLowerCase();
const SLUG = arg('slug', 'slava');
const DRY = process.argv.includes('--dry');
if (!FILE || !/^[a-z0-9]{1,40}$/.test(NAME)) {
  console.error('Usage: --file <draft.md> --name <canvas name: lowercase letters and digits>');
  process.exit(1);
}

const URL_ = process.env.VITE_SUPABASE_URL || envFrom('.env.test.local', 'VITE_SUPABASE_URL');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envFrom('.env.test.local', 'SUPABASE_SERVICE_ROLE_KEY');
if (!URL_ || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.test.local).');
  process.exit(1);
}
// An allowlist, as in seed-p1508-canvas.mjs: anything but the test project is refused.
const TEST_REF = 'gfjctyxqlwexxwsmkakq';
const REF = URL_.replace('https://', '').split('.')[0];
if (REF !== TEST_REF) {
  console.error(`REFUSING: ${REF} is not the test project (${TEST_REF}). This script is test-only.`);
  process.exit(1);
}

// src/lib/canvas-boxes.ts is the source of truth (this script cannot import TypeScript).
const BOXES = new Set(['love', 'good-at', 'world-needs', 'segments', 'problem', 'solution',
  'advantage', 'channels', 'metrics', 'revenue', 'cost']);
const CANVAS_TAG = `canvas_${NAME}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse the draft. Every malformed entry stops the run: a half-loaded canvas is worse than none. */
function parse(text) {
  const items = [];
  let box = null;
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const h = line.match(/^###\s+(\S+)/);
    if (h) {
      box = h[1].toLowerCase();
      if (!BOXES.has(box)) throw new Error(`unknown box "${h[1]}"`);
      continue;
    }
    const p = line.match(/^- point:\s*(.+)$/);
    if (p) {
      if (!box) throw new Error(`point before any box: ${p[1]}`);
      cur = { box, statement: p[1].trim(), story: null, reused: null };
      items.push(cur);
      continue;
    }
    const s = line.match(/^\s+story:\s*(.+)$/);
    if (s && cur) { cur.story = s[1].trim(); continue; }
    const r = line.match(/^\s+reused_story_id:(.*)$/);
    if (r && cur) {
      // Exactly "-" (optionally followed by a space and a note) means none; else a story id.
      const v = r[1].trim();
      if (UUID.test(v)) cur.reused = v;
      else if (v === '-' || v.startsWith('- ')) cur.reused = null;
      else throw new Error(`malformed reused_story_id "${v}"`);
      continue;
    }
  }
  for (const it of items) {
    if (/[–—]/.test(it.statement + (it.story ?? ''))) throw new Error(`dash in: ${it.statement}`);
    if (it.story === null) throw new Error(`no story line for: ${it.statement}`);
  }
  return items;
}

const admin = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function seed() {
  const items = parse(readFileSync(resolve(FILE), 'utf8'));
  const withStory = items.filter(i => i.story && i.story !== 'NO SOURCE FOUND');
  console.log(`${DRY ? 'DRY RUN: ' : ''}${REF} (test): /p/${SLUG}/canvas/${NAME}: ${items.length} points, ${withStory.length} stories`);
  if (DRY) {
    for (const i of items) console.log(`  [${i.box}] ${i.statement.slice(0, 70)}${i.story === 'NO SOURCE FOUND' ? '  (no story)' : ''}`);
    return;
  }
  const owner = await must('owner', admin.from('profiles').select('id').eq('slug', SLUG).maybeSingle());
  if (!owner) throw new Error(`no profile with slug ${SLUG}`);

  let created = 0, reused = 0, moved = 0, stories = 0, kept = 0;
  for (const it of items) {
    const boxTag = `canvas:${it.box}`;
    const existing = await must('find point', admin.from('points').select('id, system_tags')
      .eq('first_validator_id', owner.id).eq('statement', it.statement).limit(1).maybeSingle());
    let pointId;
    if (existing) {
      pointId = existing.id;
      reused += 1;
      const tags = (existing.system_tags ?? []).filter(t => !t.startsWith('canvas:') || t === boxTag);
      const next = [...new Set([...tags, boxTag, CANVAS_TAG])];
      if (next.length !== (existing.system_tags ?? []).length || next.some(t => !(existing.system_tags ?? []).includes(t))) {
        await must('retag', admin.from('points').update({ system_tags: next }).eq('id', pointId));
        moved += 1;
      }
    } else {
      pointId = (await must('insert point', admin.from('points').insert({
        statement: it.statement, first_validator_id: owner.id, visibility: 'public',
        tags: [NAME], system_tags: [boxTag, CANVAS_TAG],
      }).select('id').single())).id;
      created += 1;
    }
    // The owner stands behind their own canvas: agree, unless they already took a position.
    await must('position', admin.from('point_positions').upsert(
      { point_id: pointId, user_id: owner.id, position: 'agree' },
      { onConflict: 'point_id,user_id', ignoreDuplicates: true }));

    if (!it.story || it.story === 'NO SOURCE FOUND') continue;
    const linked = await must('find link', admin.from('story_points').select('story_id')
      .eq('author_id', owner.id).eq('point_id', pointId).maybeSingle());
    if (linked) { kept += 1; continue; }
    let storyId = it.reused;
    if (storyId) {
      const own = await must('reused story', admin.from('stories').select('id').eq('id', storyId).eq('author_id', owner.id).maybeSingle());
      if (!own) throw new Error(`reused_story_id ${storyId} is not the owner's story`);
    } else {
      const found = await must('find story', admin.from('stories').select('id')
        .eq('author_id', owner.id).eq('content', it.story).limit(1).maybeSingle());
      storyId = found?.id ?? (await must('insert story', admin.from('stories').insert({
        content: it.story, author_id: owner.id, visibility: 'public',
      }).select('id').single())).id;
    }
    await must('link', admin.from('story_points').insert({ story_id: storyId, point_id: pointId, author_id: owner.id }));
    stories += 1;
  }
  console.log(`  points: ${created} new, ${reused} existing (${moved} retagged); stories linked: ${stories}, already had one: ${kept}`);
  console.log(`Open: /p/${SLUG}/canvas/${NAME}`);
}

await seed();
