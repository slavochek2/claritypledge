#!/usr/bin/env node
/**
 * P1542: seed two Social Hikes on the TEST database for trying the hike close and the optional
 * preparation by hand, then remove them again.
 *
 *   node scripts/archive/migrations/20261022-p1542-seed-local-hikes.mjs --email <signed-up-test-account>
 *   node scripts/archive/migrations/20261022-p1542-seed-local-hikes.mjs --email <same> --cleanup
 *   (add --origin http://localhost:5400 to change the printed URLs)
 *   (add --also <email>, repeatable, to register more test accounts for the live and ended hikes)
 *   (add --new-hiker to also reset a dedicated "new hiker" test account and print a one-time sign-in link — below)
 *
 * Creates, all with series_slug 'social-hike', hosted by a seeded host account:
 *   (a) an UPCOMING hike (tomorrow) the account is registered for: its room, and the optional preparation from it
 *   (b) a hike that ENDED about an hour ago (a 1-hour hike that started 2 hours ago), account registered: its room
 *       opens on Give feedback and /close works
 *   (c) an UPCOMING hike (in three days) the account is NOT registered for: registering, and its thank-you
 *   (d) a hike that STARTED ten minutes ago (status 'upcoming', as a running event has; re-running resets the start
 *       to ten minutes ago): its room shows Feedback enabled (founder round 3, 2026-10-23)
 * The --also accounts are registered for (b) and (d).
 * and makes sure at least one approved Social Hike review exists, so the examples show.
 *
 * --new-hiker (round 6d): creates or reuses NEW_HIKER_EMAIL, a seeded test account that is NOT a member of any group,
 * has NOT learned and has given no feedback, registered for the live and ended hikes and NOT for the open one. Every
 * run resets it to exactly that, touching only that account (and, for per-event rows, only these seed events):
 * its memberships, preparation parts and completions, feedback / close rows (and any review they created), personal
 * asks, room answers and group-chat opens. Then it prints a single-use sign-in link (admin magic link) that lands in
 * the live hike's room on --origin. Links are single-use and expire: re-run for a fresh one. (The browser keeps its
 * own "group chat opened" flag per account; use a fresh/private window to see the WhatsApp offer again.)
 *
 * Runs on whichever TEST server is active (P1591: scripts/lib/active-test.sh, the flip state of .env.test.local —
 * hosted or self-hosted); refuses when that cannot be told, and never on prod. Idempotent: re-running reuses what exists, and
 * (round 6c) RESETS every hike's start and length relative to now, so a re-run days later gives the same four states:
 * upcoming and open stay in the future, ended has just ended, live started ten minutes ago.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PROD_REF = 'besjtuodziykmjidubzw';
const HOST_EMAIL = 'p1542-seed-host@example.com';
const NEW_HIKER_EMAIL = 'p1542-new-hiker@example.com';
// Round 9: every seed hike carries the banner a real TEST hike already uses (the public media bucket, built the way
// src/lib/public-media.ts publicMediaUrl() builds it — no other host: prod CSP allows storage.googleapis.com only).
const mediaUrl = (path) => `https://storage.googleapis.com/claritypledge-story-images/${path}`;
const SEED_BANNER = { banner_url: mediaUrl('hikes/social-hike/banner-1491d0-std.jpg'), banner_mobile_url: mediaUrl('hikes/social-hike/banner-1491d0-mobile.jpg') };
const SEED_QUOTE = 'P1542 seed review: a small group, an easy pace and good company.';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1]; };
const email = opt('--email');
const cleanup = args.includes('--cleanup');
const newHiker = args.includes('--new-hiker');
const also = args.flatMap((a, i) => (a === '--also' && args[i + 1] ? [args[i + 1]] : []));
const origin = (opt('--origin') ?? 'http://localhost:5400').replace(/\/$/, '');
if (!email) { console.error('Usage: --email <address> [--cleanup] [--origin <url>]'); process.exit(1); }

const vars = Object.fromEntries(
  readFileSync(join(ROOT, '.env.test.local'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
);
const url = vars.VITE_SUPABASE_URL ?? '';
// P1591: the active TEST server, from its one resolver, run on the SAME file read above. It accepts only the exact
// hosted or self-hosted TEST URL (round 6d: never a substring match) and fails closed (exit 2) on anything else.
const ENV_FILE = join(ROOT, '.env.test.local');
let activeTest = '';
try {
  activeTest = execFileSync('bash', ['-c', 'source "$1" && active_test_target', '_', join(ROOT, 'scripts', 'lib', 'active-test.sh')], {
    encoding: 'utf8',
    env: { ...process.env, CP_ACTIVE_TEST_FILE: ENV_FILE },
  }).trim();
} catch { /* refused below */ }
let origin_ = '';
try { origin_ = new URL(url).origin; } catch { /* not a URL: refused below */ }
if (!['hosted', 'selfhosted'].includes(activeTest) || !origin_.startsWith('https://') || url.includes(PROD_REF) || !vars.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('REFUSED: the active TEST server could not be resolved (scripts/lib/active-test.sh), or the service URL is not a TEST server. Nothing was changed.');
  process.exit(1);
}
console.log(`Seeding the active TEST server (${activeTest}).`);
const db = createClient(url, vars.SUPABASE_SERVICE_ROLE_KEY);
const must = (r, what) => { if (r.error) { console.error(`${what} failed: ${r.error.message}`); process.exit(2); } return r.data; };

const { data: me } = await db.from('profiles').select('id, slug').eq('email', email).maybeSingle();
if (!me) { console.error(`No profile with email ${email} on the test database. Sign up first.`); process.exit(1); }
const tag = me.id.slice(0, 8);
const slugs = { upcoming: `p1542-seed-${tag}-upcoming`, ended: `p1542-seed-${tag}-ended`, open: `p1542-seed-${tag}-open`, live: `p1542-seed-${tag}-live` };
const extra = [];
for (const e of also) {
  const { data: p } = await db.from('profiles').select('id').eq('email', e).maybeSingle();
  if (!p) { console.error(`No profile with email ${e} on the test database. Sign up first.`); process.exit(1); }
  extra.push(p);
}

if (cleanup) {
  const evs = must(await db.from('events').select('id, slug').in('slug', Object.values(slugs)), 'find events');
  for (const e of evs) {
    await db.from('email_send_log').delete().eq('event_id', e.id);
    must(await db.from('events').delete().eq('id', e.id), `delete ${e.slug}`);
  }
  await db.from('series_reviews').delete().eq('quote', SEED_QUOTE);
  const { data: host } = await db.from('profiles').select('id').eq('email', HOST_EMAIL).maybeSingle();
  if (host) {
    const { count } = await db.from('events').select('id', { count: 'exact', head: true }).eq('host_id', host.id);
    if (!count) { await db.from('membership').delete().eq('user_id', host.id); await db.auth.admin.deleteUser(host.id); }
  }
  console.log(`Removed ${evs.length} seeded event(s) for ${email}.`);
  process.exit(0);
}

// The host: a seeded, verified account (like the e2e hosts), shared by every seeded hike.
let { data: host } = await db.from('profiles').select('id').eq('email', HOST_EMAIL).maybeSingle();
if (!host) {
  const created = await db.auth.admin.createUser({ email: HOST_EMAIL, password: 'test-password-12345', email_confirm: true, user_metadata: { name: 'Seed Hike Host' } });
  if (created.error) { console.error('create host failed:', created.error.message); process.exit(2); }
  const id = created.data.user.id;
  must(await db.from('profiles').insert({
    id, email: HOST_EMAIL, name: 'Seed Hike Host', slug: `seed-hike-host-${tag}`, role: 'Hike host', linkedin_url: '', reason: 'Seeded for P1542 manual testing',
    avatar_color: '#4A90E2', pledge_version: 2, accepted_terms_version: 'v1.4', banner_generation_attempted: false, is_verified: true, has_pledged: true,
  }), 'create host profile');
  host = { id };
}

const HOUR = 3600 * 1000;
const hikeDetails = { distance_km: 9.4, elevation_gain_m: 410, route_type: 'Loop', walk_time_text: '3.5-4 h', difficulty: 'Moderate', meet_walk_minutes: 6, meet_name: 'Into the Woods cafe' };
// Round 3: the organising community (named on the screens) and a WhatsApp group (the coordination link), as real hikes have.
const { data: community } = await db.from('organization').select('id, name').eq('slug', 'cm').maybeSingle();
const SEED_CHAT = 'https://chat.whatsapp.com/P1542SeedTestGroup';
// Hosting into a group is an organizer capability (P1060 D4): the seed host organizes it on the TEST database only.
if (community) {
  const m = await db.from('membership').select('id').eq('org_id', community.id).eq('user_id', host.id).maybeSingle();
  if (!m.data) must(await db.from('membership').insert({ org_id: community.id, user_id: host.id, role: 'organizer' }), 'seed host organizer');
}
const base = {
  host_id: host.id, status: 'upcoming', duration_minutes: 240, timezone: 'Asia/Bangkok',
  location: 'Doi Suthep trailhead, Chiang Mai', series_slug: 'social-hike', hike_details: hikeDetails,
  ...(community ? { org_id: community.id } : {}),
  description: 'A relaxed Social Hike for people who want nature and conversation, not a race. We meet at a cafe first, walk together at an easy pace and talk on the way. Everyone is responsible for their own safety; this is a non-commercial meetup.',
};
const plan = [
  { key: 'upcoming', title: 'Social Hike: Doi Suthep forest loop (seed, upcoming)', datetime: new Date(Date.now() + 24 * HOUR).toISOString(), duration: 240 },
  // Ended about an hour ago: a 1-hour hike that started 2 hours ago (inside the room's 12-hour grace, so the room is live).
  { key: 'ended', title: 'Social Hike: Doi Suthep forest loop (seed, ended)', datetime: new Date(Date.now() - 2 * HOUR).toISOString(), duration: 60, also: true },
  { key: 'live', title: 'Social Hike: Mon Jam ridge walk (seed, started 10 min ago)', datetime: new Date(Date.now() - 10 * 60 * 1000).toISOString(), duration: 240, also: true },
  { key: 'open', title: 'Social Hike: Huay Kaew waterfall trail (seed, not registered)', datetime: new Date(Date.now() + 72 * HOUR).toISOString(), duration: 240, rsvp: false },
];
const urls = [];
const seeded = {};
for (const p of plan) {
  let { data: ev } = await db.from('events').select('id, slug').eq('slug', slugs[p.key]).maybeSingle();
  if (!ev) ev = must(await db.from('events').insert({ ...base, slug: slugs[p.key], title: p.title, datetime: p.datetime, duration_minutes: p.duration }).select('id, slug').single(), `create ${p.key}`);
  seeded[p.key] = ev;
  must(await db.from('events').update({ ...SEED_BANNER, hike_details: hikeDetails, ...(community ? { org_id: community.id } : {}) }).eq('id', ev.id), `refresh ${p.key}`);
  must(await db.from('event_private_info').upsert({ event_id: ev.id, group_chat_url: SEED_CHAT, updated_at: new Date().toISOString() }, { onConflict: 'event_id' }), `group chat ${p.key}`);
  // Round 6c: every re-run resets the start, the length and the status, so each hike is in its named state again.
  must(await db.from('events').update({ datetime: p.datetime, duration_minutes: p.duration, status: 'upcoming' }).eq('id', ev.id), `reset ${p.key} start`);
  if (p.rsvp === false) { urls.push(`${p.key}: ${origin}/events/${ev.slug}   (not registered)`); continue; }
  const rsvp = await db.from('event_rsvps').select('id').eq('event_id', ev.id).eq('profile_id', me.id).maybeSingle();
  if (!rsvp.data) must(await db.from('event_rsvps').insert({ event_id: ev.id, profile_id: me.id }), `rsvp ${p.key}`);
  for (const x of p.also ? extra : []) {
    const r2 = await db.from('event_rsvps').select('id').eq('event_id', ev.id).eq('profile_id', x.id).maybeSingle();
    if (!r2.data) must(await db.from('event_rsvps').insert({ event_id: ev.id, profile_id: x.id }), `rsvp ${p.key} (--also)`);
  }
  urls.push(`${p.key}: ${origin}/events/${ev.slug}   (room: /room, close: /close)`);
}

if (newHiker) {
  // The dedicated account: created once, then reused; verified, so the signed-in shell shows.
  let { data: hiker } = await db.from('profiles').select('id, slug').eq('email', NEW_HIKER_EMAIL).maybeSingle();
  if (!hiker) {
    const created = await db.auth.admin.createUser({ email: NEW_HIKER_EMAIL, email_confirm: true, user_metadata: { name: 'New Hiker' } });
    if (created.error) { console.error('create new hiker failed:', created.error.message); process.exit(2); }
    const id = created.data.user.id;
    must(await db.from('profiles').insert({
      id, email: NEW_HIKER_EMAIL, name: 'New Hiker', slug: `p1542-new-hiker-${tag}`, role: 'Hiker', linkedin_url: '', reason: 'Seeded for P1542 manual testing',
      avatar_color: '#4A90E2', pledge_version: 2, accepted_terms_version: 'v1.4', banner_generation_attempted: false, is_verified: true, has_pledged: true,
    }), 'create new hiker profile');
    hiker = { id, slug: `p1542-new-hiker-${tag}` };
  }
  const seedIds = Object.values(seeded).map((e) => e.id);
  // Reset — ONLY this account; per-event rows ONLY for these seed events.
  must(await db.from('membership').delete().eq('user_id', hiker.id), 'reset new hiker: memberships');
  must(await db.from('person_prep_parts').delete().eq('profile_id', hiker.id), 'reset new hiker: learning parts');
  must(await db.from('event_preparations').delete().eq('profile_id', hiker.id).in('event_id', seedIds), 'reset new hiker: learning completion');
  must(await db.from('series_reviews').delete().eq('author_profile_id', hiker.id).in('source_event_id', seedIds), 'reset new hiker: reviews from feedback');
  must(await db.from('event_feedback').delete().eq('user_id', hiker.id).in('event_id', seedIds), 'reset new hiker: feedback / close');
  must(await db.from('personal_ask_answers').delete().eq('user_id', hiker.id).in('event_id', seedIds), 'reset new hiker: personal asks');
  // Room answers: event_room_answers cascade from the member row.
  must(await db.from('event_room_members').delete().eq('profile_id', hiker.id).in('event_id', seedIds), 'reset new hiker: room answers');
  // Group-chat opens (table only exists once the round-6 migration is applied; absent = nothing to reset).
  const gc = await db.from('group_chat_opens').delete().eq('profile_id', hiker.id);
  if (gc.error && !/group_chat_opens|schema cache|does not exist/i.test(gc.error.message)) { console.error(`reset new hiker: group chat opens failed: ${gc.error.message}`); process.exit(2); }
  // Registered for live and ended, never for open.
  for (const key of ['live', 'ended']) {
    const r = await db.from('event_rsvps').select('id').eq('event_id', seeded[key].id).eq('profile_id', hiker.id).maybeSingle();
    if (!r.data) must(await db.from('event_rsvps').insert({ event_id: seeded[key].id, profile_id: hiker.id }), `new hiker rsvp ${key}`);
  }
  must(await db.from('event_rsvps').delete().eq('event_id', seeded.open.id).eq('profile_id', hiker.id), 'new hiker: not registered for open');
  // A single-use sign-in link landing in the live hike's room. generateLink's own action_link is an implicit-flow URL
  // (#access_token), which this app's PKCE client refuses ("Link Expired or Invalid" — verified); the app's
  // /auth/verify route redeems the link's hashed token with verifyOtp instead (P1257), then hands off to /auth/callback
  // with ?redirect= intact.
  const link = await db.auth.admin.generateLink({ type: 'magiclink', email: NEW_HIKER_EMAIL });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) { console.error(`sign-in link failed: ${link.error?.message ?? 'no hashed token'}`); process.exit(2); }
  const signIn = `${origin}/auth/verify?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&redirect=${encodeURIComponent(`/events/${seeded.live.slug}/room`)}`;
  console.log(`New hiker (${NEW_HIKER_EMAIL}) reset: not a member, not learned, no feedback; registered for live + ended, not open.`);
  console.log(`One-time sign-in link (single use, expires; re-run for a new one):\n${signIn}`);
}

const { count: approved } = await db.from('series_reviews').select('id', { count: 'exact', head: true }).eq('series_slug', 'social-hike').eq('status', 'approved');
if (!approved) {
  must(await db.from('series_reviews').insert({ series_slug: 'social-hike', quote: SEED_QUOTE, author_name: 'Seed Hiker', status: 'approved', sort_order: 9500 }), 'seed review');
  console.log('No approved Social Hike review existed: added one seed review (removed by --cleanup).');
} else {
  console.log(`${approved} approved Social Hike review(s) present: they show on hike pages.`);
}
console.log(community ? `Organising community: ${community.name}` : 'No organization with slug cm: screens say "this community".');
console.log(urls.join('\n'));
