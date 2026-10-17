#!/usr/bin/env npx tsx
/**
 * @file p1509-seed-personas.ts
 * @description P1509 v16: seed the mock chat world (mock-data.ts) as real rows on the Supabase TEST project, one
 * auth user per persona, so every v16 screen except the chat itself reads real data.
 *
 * Usage:
 *   npx tsx scripts/p1509-seed-personas.ts            # reset, then seed (re-runnable)
 *   npx tsx scripts/p1509-seed-personas.ts --reset    # delete what a previous run created, nothing else
 *   npx tsx scripts/p1509-seed-personas.ts --dry-run  # read-only: print the plan and what a reset would remove
 *
 * Safety (each is enforced in code, and pinned by src/tests/p1509-v16-seed-guard.test.ts):
 *  1. Aborts unless VITE_SUPABASE_URL, read from .env.local only, is the test project (`isTestProject`). The service
 *     key is TEST_SUPABASE_SERVICE_ROLE_KEY from the same file. No other environment file or variable is read.
 *  2. Rows are written straight to tables with the service role. Nothing here invokes an edge function or a flow that
 *     sends mail: the test project holds a live Mailgun key.
 *  3. Persona addresses use the reserved `.invalid` TLD (RFC 2606: undeliverable). Accounts are created confirmed, so
 *     no confirmation mail exists either. If the admin API rejects that domain the run stops (exit 3); it never
 *     falls back to another domain.
 *  4. Every run sets a fresh random password per persona and writes it, mode 0600, to a file OUTSIDE the repository
 *     (persona-secrets.ts: inside the repo Vite would serve it). The script refuses to start if that path is inside
 *     the repo. Passwords are never printed.
 *  5. Tag = ownership. Every seeded row belongs to a persona. Reset locates the personas by their exact address,
 *     deletes only rows keyed to those user ids (children before parents), then deletes the accounts. Before the
 *     first delete a read-only preflight checks every foreign key that points at a row the reset removes (the list is
 *     DERIVED from supabase/migrations by p1509-fk-graph.ts and judged edge by edge in p1509-seed-cascade.ts). A row
 *     owned by anyone else, or with no owner, that a cascade would delete or that would block the account delete
 *     aborts the run (exit 2) with the table and count, and nothing is deleted.
 *  6. Seeded RSVPs are marked as already mailed for every scheduled kind through `set_rsvp_message_ids`, the only
 *     sanctioned writer of that column.
 *  7. Agent-authored content carries no tags at all (the allowed system tags are a closed list; none is needed).
 *
 * Known limitation: the preflight and the deletes are separate requests, not one transaction (a transaction needs a
 * database function, i.e. a migration, which v16 forbids). A row another session creates against a persona in the
 * window between them is not seen. The window is seconds long, on a test project, against throwaway personas; a row
 * that blocks the account delete in that window makes the run fail loudly and a re-run reports it.
 * Known drift: the live test project has foreign keys no migration declares (e.g. clarity_letters.org_id); none points
 * at a table this reset deletes from.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { EVENTS, GROUPS, PEOPLE, type PersonId } from '../src/app/prototypes/clarity-chat-v16/mock-data';
import { SEED_ADMIN_IDS, SEED_LETTERS, SEED_SHAREABLE, seedEventSlug } from '../src/app/prototypes/clarity-chat-v16/seed-world';
import { PERSONA_SECRETS_FILE, assertOutside, writePersonaSecrets } from '../src/app/prototypes/clarity-chat-v16/persona-secrets';
import {
  PERSONA_IDS,
  isTestProject,
  personaEmail,
  personaSlug,
} from '../src/app/prototypes/clarity-chat-v16/personas';
import { CURRENT_TERMS_VERSION } from '../src/lib/constants';
import { CURRENT_AGREEMENT_VERSION } from '../src/app/content/agreement-versions';
import type { PositionType } from '../src/app/types';
import { buildFkGraph, deriveReferrers, parserProblems, type FkGraph, type Referrers } from './p1509-fk-graph';
import { cascadePreflight, describeProblems, classificationCoverage, setNullProblems } from './p1509-seed-cascade';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENT_NO_ID = 'SENT_NO_ID';
const MAIL_KINDS = ['reminder', 'feedback', 'starting_soon'] as const;
const LOCAL_TZ = 'Asia/Bangkok';
const LOCAL_OFFSET = '+07:00';
/** The two viewers of the prototype (mock-data `ViewerId`). They hold no positions on other people's points, so the
 * "your position" state on a point stays free for them to use. */
const VIEWER_IDS = ['bob', 'dana'] as const satisfies readonly PersonId[];

// ───────────────────────────── guards ─────────────────────────────

export class SeedGuardError extends Error {}

/** Throws unless the URL is the test project. The host is named in the message; keys never are. */
export function assertTestProject(supabaseUrl: string | undefined): void {
  if (isTestProject(supabaseUrl)) return;
  let host = 'unset';
  try {
    host = supabaseUrl ? new URL(supabaseUrl).hostname : 'unset';
  } catch {
    host = 'unparseable';
  }
  throw new SeedGuardError(`Refusing to run: Supabase URL host "${host}" is not the test project.`);
}

/** Reads the URL and service key from .env.local ONLY (not the process environment, not another env file). */
export function readSeedEnv(envFileText: string): { url: string; serviceKey: string } {
  const parsed = dotenv.parse(envFileText);
  const url = parsed['VITE_SUPABASE_URL'];
  assertTestProject(url);
  const serviceKey = parsed['TEST_SUPABASE_SERVICE_ROLE_KEY'];
  if (!serviceKey) throw new SeedGuardError('TEST_SUPABASE_SERVICE_ROLE_KEY is missing from .env.local.');
  return { url: url as string, serviceKey };
}

/** Exact, case-sensitive, untrimmed match against the persona address list. Auth stores addresses lowercase, so a
 * variant that does not match exactly is simply not ours, and reset leaves it alone. */
export function isPersonaAccountEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && PERSONA_IDS.some((id) => email === personaEmail(id));
}

/** The persona accounts among a list of auth users, keyed by persona id. */
export function matchPersonaUsers(users: ReadonlyArray<{ id: string; email?: string | null }>): Map<PersonId, string> {
  const found = new Map<PersonId, string>();
  for (const u of users) {
    const pid = PERSONA_IDS.find((id) => u.email === personaEmail(id));
    if (pid) found.set(pid, u.id);
  }
  return found;
}

// ───────────────────────────── reset filters ─────────────────────────────

export interface ResetFilter {
  table: string;
  /** The column that names the owning persona. */
  column: string;
  /** Persona user ids; always exactly the list the filter was built from. */
  values: string[];
  /** Rows of this role are left to the account deletion's cascade (see the membership entry of RESET_ORDER). */
  excludeRole?: string;
}

/** (table, owner column) in FK-safe delete order. Nothing else is ever deleted by this script except the accounts. */
export const RESET_ORDER: ReadonlyArray<{ table: string; column: string; excludeRole?: string }> = [
  // Deliveries are never deleted by receiver: a delivery to a persona on someone else's letter is not ours (it is a
  // preflight problem). Deliveries on persona letters go with the letter.
  { table: 'clarity_letters', column: 'sender_id' }, // cascades its deliveries, snapshots, predictions
  { table: 'clarity_docs', column: 'owner_id' }, // cascades doc_stories; after letters (letters reference docs)
  { table: 'clarity_agreements', column: 'creator_profile_id' }, // RESTRICT on the profile otherwise
  // Preparations first: p1336_prep_guard pins event_preparations.rsvp_id, so the FK's SET NULL cannot release an RSVP
  // a preparation still names.
  { table: 'event_preparations', column: 'profile_id' },
  { table: 'event_rsvps', column: 'profile_id' },
  { table: 'events', column: 'host_id' }, // dependent rows cascade; foreign RSVPs were refused in the preflight
  { table: 'point_positions', column: 'user_id' },
  { table: 'story_points', column: 'author_id' },
  { table: 'stories', column: 'author_id' }, // cascades versions; after letters (snapshots reference stories)
  { table: 'points', column: 'first_validator_id' },
  // The last organizer of a group cannot leave it by a direct delete (P1193). Organizer rows go with the account
  // (a cascade passes that guard); plain members are deleted here so the count is reported.
  { table: 'membership', column: 'user_id', excludeRole: 'organizer' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure: the delete filters, built from the persona user-id list and nothing else. */
export function buildResetFilters(personaUserIds: readonly string[]): ResetFilter[] {
  for (const id of personaUserIds) {
    if (!UUID_RE.test(id)) throw new SeedGuardError(`Refusing to build a delete filter from a non-uuid id: ${JSON.stringify(id)}`);
  }
  if (personaUserIds.length === 0) return [];
  return RESET_ORDER.map((s) => ({ ...s, values: [...personaUserIds] }));
}

// ───────────────────────────── the world ─────────────────────────────

export interface PlannedMembership { groupSlug: string; persona: PersonId; role: 'organizer' | 'member' }
export interface PlannedEvent {
  key: string; groupSlug: string; title: string; description: string; datetime: string; location: string;
  status: 'upcoming' | 'completed'; host: PersonId; mockHost: PersonId; attendees: PersonId[];
}

export function planMemberships(): PlannedMembership[] {
  return GROUPS.flatMap((g) =>
    g.members.map((persona) => ({ groupSlug: g.slug, persona, role: g.organizers.includes(persona) ? ('organizer' as const) : ('member' as const) })),
  );
}

/** Calendar date (UTC noon, to dodge DST) of `now` as seen in the local timezone, shifted by `days`. */
function localDay(now: Date, days: number): { ymd: string; label: string } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: LOCAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now).split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + days, 12));
  return {
    ymd: shifted.toISOString().slice(0, 10),
    label: shifted.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }),
  };
}

/** Mirrors EVENTS: one today in cm, one two weeks back in cm, one three weeks back in online, one a week ahead. */
const EVENT_SCHEDULE: Record<string, { days: number; hour: number; prefix: string }> = {
  'night-oct16': { days: 0, hour: 19, prefix: 'Clarity Night' },
  'night-oct02': { days: -14, hour: 19, prefix: 'Clarity Night' },
  'online-sept': { days: -21, hour: 18, prefix: 'Online practice' },
  'online-oct23': { days: 7, hour: 18, prefix: 'Online practice' },
};

export function planEvents(now: Date): PlannedEvent[] {
  return EVENTS.map((ev) => {
    const sched = EVENT_SCHEDULE[ev.id];
    if (!sched) throw new Error(`No schedule for mock event ${ev.id}`);
    const group = GROUPS.find((g) => g.id === ev.groupId);
    if (!group) throw new Error(`Mock event ${ev.id} names unknown group ${ev.groupId}`);
    const day = localDay(now, sched.days);
    // events_org_requires_organizer (P1060): an event with an org must be hosted by one of that org's organizers.
    // A mock host who is not an organizer cannot be represented, so the group's first organizer hosts instead.
    const host = group.organizers.includes(ev.host) ? ev.host : (group.organizers[0] as PersonId);
    return {
      key: ev.id,
      groupSlug: group.slug,
      title: `${sched.prefix}, ${day.label}`,
      description: ev.description,
      datetime: `${day.ymd}T${String(sched.hour).padStart(2, '0')}:00:00${LOCAL_OFFSET}`,
      location: ev.location,
      status: sched.days < 0 ? 'completed' : 'upcoming',
      host,
      mockHost: ev.host,
      attendees: [...ev.attendees],
    };
  });
}

const POSITION_ORDER: PositionType[] = ['strongly_agree', 'agree', 'somewhat_agree', 'unsure', 'somewhat_disagree', 'disagree', 'strongly_disagree'];

/** Counts → one position per voter, categories interleaved so cutting the list short keeps the mix. */
export function expandCounts(counts: Partial<Record<PositionType, number>>): PositionType[] {
  const left = POSITION_ORDER.map((p) => ({ p, n: counts[p] ?? 0 }));
  const out: PositionType[] = [];
  while (left.some((c) => c.n > 0)) {
    for (const c of left) if (c.n > 0) { out.push(c.p); c.n -= 1; }
  }
  return out;
}

export interface PlannedPosition { pointKey: string; persona: PersonId; position: PositionType }
export function planPositions(): { positions: PlannedPosition[]; asked: Record<string, number>; seeded: Record<string, number> } {
  const positions: PlannedPosition[] = [];
  const asked: Record<string, number> = {};
  const seeded: Record<string, number> = {};
  for (const s of SEED_SHAREABLE.filter((x) => x.kind === 'point')) {
    const wanted = expandCounts(s.counts ?? {});
    const voters = PERSONA_IDS.filter((id) => id !== s.author && !(VIEWER_IDS as readonly PersonId[]).includes(id));
    const taken = wanted.slice(0, voters.length);
    taken.forEach((position, i) => positions.push({ pointKey: s.id, persona: voters[i] as PersonId, position }));
    // The author holds a position on their own point, as 70% of the test project's real authors do (sampled: 140 of
    // the 200 latest points). Without it the point is missing from the author's own "my points" (Share picker).
    positions.push({ pointKey: s.id, persona: s.author, position: 'agree' });
    asked[s.id] = wanted.length;
    seeded[s.id] = taken.length;
  }
  return { positions, asked, seeded };
}

const TERMS_TEXT = [
  'Request channel: synchronous in live meetings',
  'Scope: topics that affect our shared work',
  'Termination: before ending, we each answer one final clarity letter and hold one clarity live session',
].join('\n');

// ───────────────────────────── secrets file ─────────────────────────────

export function freshPassword(): string {
  return randomBytes(24).toString('base64url');
}

// ───────────────────────────── database helpers ─────────────────────────────

type Db = SupabaseClient;
type DbError = { message: string } | null;

function check(what: string, error: DbError): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function insertOne(db: Db, table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from(table).insert(row).select('id').single();
  check(`insert ${table}`, error);
  return (data as { id: string }).id;
}

async function insertMany(db: Db, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  // Rows with different keys: a key absent from one row must take the column default, not null.
  const { error } = await db.from(table).insert(rows, { defaultToNull: false });
  check(`insert ${table}`, error);
}

async function listAllUsers(db: Db): Promise<{ id: string; email?: string | null }[]> {
  const perPage = 1000;
  const users: { id: string; email?: string | null }[] = [];
  for (let page = 1; page <= 500; page++) {
    // A long scan through a VPN tunnel can lose one connection (ECONNRESET); a page is retried, never skipped.
    let res = await db.auth.admin.listUsers({ page, perPage });
    for (let attempt = 1; res.error && attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      res = await db.auth.admin.listUsers({ page, perPage });
    }
    const { data, error } = res;
    check(`list auth users (page ${page})`, error);
    users.push(...data.users);
    if (data.users.length < perPage) return users; // exhausted
  }
  throw new Error('list auth users: more than 500 pages; refusing to treat a partial scan as a census');
}

/** Every foreign key that points at a table the reset deletes from, derived from the migrations. */
/** The tables the reset deletes from, plus the account store the account deletion removes. */
export const resetRoots = (): string[] => [...RESET_ORDER.map((s) => s.table), 'auth.users'];

export function loadReferrers(migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations')): { graph: FkGraph; referrers: Referrers } {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((name) => ({ name, text: readFileSync(path.join(migrationsDir, name), 'utf8') }));
  const graph = buildFkGraph(files);
  // An incomplete graph can miss a foreign key, and a reset judged against it would be judged against less than the
  // schema. Refuse before anything else.
  const incomplete = parserProblems(graph);
  if (incomplete.length > 0) {
    throw new SeedGuardError(`The migration parser cannot vouch for the foreign-key graph, so nothing was touched:\n  - ${incomplete.join('\n  - ')}`);
  }
  return { graph, referrers: deriveReferrers(graph.edges, resetRoots()) };
}


type Counts = Map<string, number>;
const bump = (counts: Counts, key: string, n: number) => counts.set(key, (counts.get(key) ?? 0) + n);

export async function runFilters(db: Db, filters: ResetFilter[], dryRun: boolean): Promise<Counts> {
  const counts: Counts = new Map();
  for (const f of filters) {
    if (dryRun) {
      let q = db.from(f.table).select('*', { count: 'exact', head: true }).in(f.column, f.values);
      if (f.excludeRole) q = q.neq('role', f.excludeRole);
      const { count, error } = await q;
      check(`count ${f.table}`, error);
      bump(counts, f.table, count ?? 0);
    } else {
      let q = db.from(f.table).delete({ count: 'exact' }).in(f.column, f.values);
      if (f.excludeRole) q = q.neq('role', f.excludeRole);
      const { count, error } = await q;
      check(`delete ${f.table}`, error);
      bump(counts, f.table, count ?? 0);
    }
  }
  return counts;
}

function printCounts(title: string, counts: Counts): void {
  console.log(title);
  for (const [table, n] of counts) console.log(`  ${table.padEnd(22)} ${n}`);
}

// ───────────────────────────── reset ─────────────────────────────

export async function reset(db: Db, dryRun: boolean, secretsFile: string = PERSONA_SECRETS_FILE): Promise<Map<PersonId, string>> {
  const { graph, referrers } = loadReferrers();
  const coverage = classificationCoverage(referrers);
  if (coverage.unclassified.length > 0 || coverage.stale.length > 0) {
    throw new SeedGuardError(
      'The migrations declare foreign keys that p1509-seed-cascade.ts has not ruled on (or rules on ones that are gone); nothing was touched.\n' +
        `  unclassified: ${coverage.unclassified.map((e) => `${e.child}.${e.columns.join(',')}->${e.parent}`).join(', ') || 'none'}\n  stale: ${coverage.stale.join(', ') || 'none'}`,
    );
  }
  const audit = setNullProblems(graph, referrers);
  if (audit.length > 0) {
    throw new SeedGuardError(`An ON DELETE SET NULL ruling does not hold against the schema; nothing was touched:\n  - ${audit.join('\n  - ')}`);
  }
  const users = await listAllUsers(db);
  console.log(`Scanned ${users.length} auth users (listing ran to exhaustion).`);
  const personas = matchPersonaUsers(users);
  const ids = [...personas.values()];
  console.log(`Persona accounts found: ${personas.size} of ${PERSONA_IDS.length}.`);
  if (ids.length === 0) return personas;

  const problems = await cascadePreflight(db, ids, referrers);
  if (problems.length > 0) {
    throw new SeedGuardError(`Reset would delete or be blocked by rows a persona does not own, so NOTHING WAS DELETED:\n  - ${describeProblems(problems)}`);
  }
  console.log(`Preflight clean: ${referrers.edges.length} foreign keys into deleted tables checked against the migrations.`);

  const counts = await runFilters(db, buildResetFilters(ids), dryRun);
  printCounts(dryRun ? 'Reset would delete (rows keyed to persona ids):' : 'Reset deleted:', counts);
  console.log('  (deliveries, snapshots, organizer memberships, profiles, history rows and other cascaded children go with them)');

  if (dryRun) return personas;
  for (const [pid, userId] of personas) {
    const { error } = await db.auth.admin.deleteUser(userId);
    check(`delete auth user ${pid}`, error);
  }
  console.log(`Deleted ${personas.size} persona accounts.`);
  if (existsSync(secretsFile)) {
    rmSync(secretsFile);
    console.log('Removed the stale persona secrets file.');
  }
  return personas;
}

// ───────────────────────────── seed ─────────────────────────────

/** GoTrue error codes meaning "this address is not acceptable". */
export const REJECTED_ADDRESS_CODES: ReadonlySet<string> = new Set(['email_address_invalid', 'email_address_not_authorized']);

async function createPersonas(db: Db): Promise<Map<PersonId, string>> {
  const passwords: Record<string, string> = {};
  const userIds = new Map<PersonId, string>();
  for (const id of PERSONA_IDS) {
    const password = freshPassword();
    const person = PEOPLE[id];
    const { data, error } = await db.auth.admin.createUser({
      email: personaEmail(id),
      password,
      email_confirm: true,
      user_metadata: { name: person.name, slug: personaSlug(id) },
    });
    if (error || !data.user) {
      const message = error?.message ?? 'no user returned';
      // Match the API's own error code. The message echoes the address, so a keyword match would also fire on an
      // unrelated failure (a bad key, a database error) that merely mentions it.
      if (error && REJECTED_ADDRESS_CODES.has((error as { code?: string }).code ?? '')) {
        throw Object.assign(
          new Error(`STOP: the admin API rejected the persona address ${personaEmail(id)} (${(error as { code?: string }).code}). Not switching domain; report this.`),
          { exitCode: 3 },
        );
      }
      throw new Error(`create auth user ${id}: ${message}`);
    }
    userIds.set(id, data.user.id);
    passwords[id] = password;
  }
  writePersonaSecrets(passwords, PERSONA_SECRETS_FILE, { root: REPO_ROOT });
  console.log(`Created ${userIds.size} confirmed accounts; passwords written outside the repository (mode 0600).`);
  return userIds;
}

export function profileRow(id: PersonId, userId: string): Record<string, unknown> {
  const p = PEOPLE[id];
  return {
    id: userId,
    email: personaEmail(id),
    name: p.name,
    slug: personaSlug(id),
    role: p.role,
    bio: p.bio,
    avatar_color: p.avatarColor,
    has_pledged: p.pledger,
    is_verified: true,
    pledge_version: 2,
    accepted_terms_version: CURRENT_TERMS_VERSION,
    banner_generation_attempted: false,
    is_admin: SEED_ADMIN_IDS.includes(id),
  };
}

async function seed(db: Db, userIds: Map<PersonId, string>, now: Date): Promise<Counts> {
  const counts: Counts = new Map();
  const uid = (id: PersonId): string => {
    const v = userIds.get(id);
    if (!v) throw new Error(`No user id for persona ${id}`);
    return v;
  };
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  // profiles: no trigger creates them, so they are written here (upsert by id, never a duplicate).
  const { error: profErr } = await db.from('profiles').upsert(PERSONA_IDS.map((id) => profileRow(id, uid(id))), { onConflict: 'id' });
  check('upsert profiles', profErr);
  bump(counts, 'profiles', PERSONA_IDS.length);

  // memberships in the two existing groups (never created here)
  const orgs = new Map<string, string>();
  for (const g of GROUPS) {
    const { data, error } = await db.from('organization').select('id').eq('slug', g.slug).maybeSingle();
    check(`read organization ${g.slug}`, error);
    if (!data) throw new Error(`Group "${g.slug}" does not exist on the test project; this script does not create groups.`);
    orgs.set(g.slug, (data as { id: string }).id);
  }
  const memberships = planMemberships();
  await insertMany(db, 'membership', memberships.map((m) => ({ org_id: orgs.get(m.groupSlug), user_id: uid(m.persona), role: m.role })));
  bump(counts, 'membership', memberships.length);

  // events (after memberships: the host must already be an organizer) + RSVPs
  const rsvpIds: string[] = [];
  for (const ev of planEvents(now)) {
    const eventId = await insertOne(db, 'events', {
      slug: seedEventSlug(ev.key),
      title: ev.title,
      description: ev.description,
      datetime: ev.datetime,
      timezone: LOCAL_TZ,
      location: ev.location,
      host_id: uid(ev.host),
      org_id: orgs.get(ev.groupSlug),
      status: ev.status,
    });
    bump(counts, 'events', 1);
    for (const attendee of ev.attendees) {
      rsvpIds.push(await insertOne(db, 'event_rsvps', { event_id: eventId, profile_id: uid(attendee) }));
    }
  }
  bump(counts, 'event_rsvps', rsvpIds.length);

  // Mark every scheduled-mail kind as already sent. The cron also needs *_scheduled_at (left null) and, for
  // starting_soon, preparation_enabled (left false), so this is a second lock on a door that was already shut.
  for (const rsvpId of rsvpIds) {
    for (const kind of MAIL_KINDS) {
      const { data, error } = await db.rpc('set_rsvp_message_ids', { p_rsvp_id: rsvpId, p_key: kind, p_expected: null, p_patch: { [kind]: SENT_NO_ID } });
      check(`set_rsvp_message_ids(${kind})`, error);
      if (data !== true) throw new Error(`set_rsvp_message_ids(${kind}) did not apply for RSVP ${rsvpId}`);
    }
  }
  const { data: marked, error: markErr } = await db.from('event_rsvps').select('id, mailgun_message_ids').in('id', rsvpIds);
  check('verify mailgun_message_ids', markErr);
  const unmarked = (marked ?? []).filter((r: { mailgun_message_ids: Record<string, string> | null }) => MAIL_KINDS.some((k) => r.mailgun_message_ids?.[k] !== SENT_NO_ID));
  if (unmarked.length > 0 || (marked ?? []).length !== rsvpIds.length) {
    throw new Error(`Mail marking verification failed: ${unmarked.length} unmarked of ${(marked ?? []).length} read (${rsvpIds.length} expected)`);
  }
  bump(counts, 'rsvps marked SENT_NO_ID (x3 kinds)', rsvpIds.length);

  // points, stories, links, positions (no tags: see header note 7)
  const pointIds = new Map<string, string>();
  for (const s of SEED_SHAREABLE.filter((x) => x.kind === 'point')) {
    pointIds.set(s.id, await insertOne(db, 'points', { statement: s.title, first_validator_id: uid(s.author), tags: [], system_tags: [], visibility: 'public' }));
    bump(counts, 'points', 1);
  }
  const links: Record<string, unknown>[] = [];
  for (const s of SEED_SHAREABLE.filter((x) => x.kind === 'story')) {
    const storyId = await insertOne(db, 'stories', { author_id: uid(s.author), content: s.excerpt ?? s.title, tags: [], system_tags: [], visibility: 'public' });
    bump(counts, 'stories', 1);
    for (const pk of s.points ?? []) {
      const pointId = pointIds.get(pk);
      if (!pointId) throw new Error(`Story ${s.id} links unknown point ${pk}`);
      links.push({ story_id: storyId, point_id: pointId, author_id: uid(s.author) });
    }
  }
  await insertMany(db, 'story_points', links);
  bump(counts, 'story_points', links.length);
  const { positions } = planPositions();
  await insertMany(db, 'point_positions', positions.map((p) => ({ point_id: pointIds.get(p.pointKey), user_id: uid(p.persona), position: p.position })));
  bump(counts, 'point_positions', positions.length);

  // letters: a letter is a doc holding one story; inbox/published ones are sealed letters, a draft is a doc alone.
  for (const l of SEED_LETTERS) {
    const author = uid(l.author);
    const age = l.daysAgo;
    const visibility = l.box === 'sent' ? 'public' : 'private';
    const docId = await insertOne(db, 'clarity_docs', { owner_id: author, title: l.title, visibility, created_at: daysAgo(age), updated_at: daysAgo(age) });
    bump(counts, 'clarity_docs', 1);
    const storyId = await insertOne(db, 'stories', { author_id: author, content: l.body, tags: [], system_tags: [], visibility });
    bump(counts, 'stories', 1);
    await insertMany(db, 'doc_stories', [{ doc_id: docId, story_id: storyId, position: 0, point_config: {} }]);
    bump(counts, 'doc_stories', 1);
    if (l.box === 'drafts') continue;

    const letterId = await insertOne(db, 'clarity_letters', {
      source_doc_id: docId, sender_id: author, mode: l.box === 'sent' ? 'one-to-many' : 'one-to-one',
      status: 'sealed', sealed_at: daysAgo(age), created_at: daysAgo(age),
    });
    bump(counts, 'clarity_letters', 1);
    const { data: version, error: verErr } = await db.from('story_versions').select('id').eq('story_id', storyId).eq('version_number', 1).single();
    check('read story_versions', verErr);
    // The snapshot mirrors what seal_and_send_letter writes.
    await insertMany(db, 'letter_story_snapshots', [{
      letter_id: letterId, story_id: storyId, version_id: (version as { id: string }).id, position: 0, visibility,
      point_config: {
        storyText: l.body, imageUrl: '', videoUrl: '', videoQuotes: { quotes: [], durationSeconds: null },
        storyAuthorId: author, points: [], order: [], hidden: [], lead_count: 1,
      },
    }]);
    bump(counts, 'letter_story_snapshots', 1);
    if (l.box === 'inbox') {
      await insertMany(db, 'letter_deliveries', [{
        letter_id: letterId, receiver_email: personaEmail('bob'), receiver_name: PEOPLE.bob.name,
        receiver_profile_id: uid('bob'), notified_at: daysAgo(age), invitation_expires_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(), created_at: daysAgo(age),
      }]);
      bump(counts, 'letter_deliveries', 1);
    }
  }

  // agreements, inserted directly (the invite flow would call the mail function)
  const agreementBase = { terms_text: TERMS_TEXT, visibility: 'private', agreement_version: String(CURRENT_AGREEMENT_VERSION) };
  await insertMany(db, 'clarity_agreements', [
    {
      ...agreementBase, creator_profile_id: uid('bob'), partner_profile_id: uid('alice'), partner_email: personaEmail('alice'),
      partner_display_name: PEOPLE.alice.name, status: 'active', partner_signed_at: daysAgo(30), created_at: daysAgo(31),
    },
    {
      ...agreementBase, creator_profile_id: uid('bob'), partner_profile_id: uid('fay'), partner_email: personaEmail('fay'),
      partner_display_name: PEOPLE.fay.name, status: 'pending',
    },
  ]);
  bump(counts, 'clarity_agreements', 2);

  return counts;
}

// ───────────────────────────── plan printing ─────────────────────────────

function printPlan(now: Date): void {
  console.log('\nSeed plan:');
  console.log(`  accounts      ${PERSONA_IDS.map((id) => personaEmail(id)).join(', ')}`);
  console.log(`  admins        ${PERSONA_IDS.filter((id) => SEED_ADMIN_IDS.includes(id)).join(', ')}`);
  console.log('  memberships (existing groups, never created):');
  for (const m of planMemberships()) console.log(`    ${m.groupSlug.padEnd(7)} ${m.persona.padEnd(6)} ${m.role}`);
  console.log('  events:');
  for (const ev of planEvents(now)) {
    const moved = ev.host === ev.mockHost ? '' : `  [mock host ${ev.mockHost} is not an organizer of ${ev.groupSlug}; the schema requires one]`;
    console.log(`    ${ev.groupSlug.padEnd(7)} ${ev.datetime}  ${ev.title}  host=${ev.host}  status=${ev.status}  rsvps=${ev.attendees.join('+')}${moved}`);
  }
  const { asked, seeded } = planPositions();
  console.log('  points (positions seeded / asked; viewers bob+dana and the author hold none):');
  for (const s of SEED_SHAREABLE.filter((x) => x.kind === 'point')) console.log(`    ${s.id.padEnd(11)} ${seeded[s.id]}/${asked[s.id]}  ${s.title}`);
  console.log('  stories:');
  for (const s of SEED_SHAREABLE.filter((x) => x.kind === 'story')) console.log(`    ${s.id.padEnd(11)} by ${s.author} -> ${(s.points ?? []).join(',')}`);
  console.log('  letters:');
  for (const l of SEED_LETTERS) console.log(`    ${l.id.padEnd(12)} ${l.box.padEnd(6)} ${l.author}${l.box === 'drafts' ? '  (doc only)' : l.box === 'inbox' ? '  -> bob inbox' : '  (published, no recipients)'}`);
  console.log('  agreements: bob-alice active; bob->fay pending (no mail)');
  console.log('  mail: every seeded RSVP marked SENT_NO_ID for reminder, feedback, starting_soon');
}

// ───────────────────────────── main ─────────────────────────────

export async function main(argv: string[]): Promise<number> {
  const flags = new Set(argv);
  const unknown = [...flags].filter((f) => !['--reset', '--dry-run'].includes(f));
  if (unknown.length > 0) {
    console.error(`Unknown option(s): ${unknown.join(' ')}. Use --reset or --dry-run.`);
    return 1;
  }
  const dryRun = flags.has('--dry-run');
  const resetOnly = flags.has('--reset');
  try {
    assertOutside(REPO_ROOT); // before any network call
    const envPath = path.join(REPO_ROOT, '.env.local');
    if (!existsSync(envPath)) throw new SeedGuardError('.env.local not found at the repo root.');
    const { url, serviceKey } = readSeedEnv(readFileSync(envPath, 'utf8'));
    console.log(`Target: ${new URL(url).hostname} (test project) | mode: ${dryRun ? 'dry-run (read-only)' : resetOnly ? 'reset only' : 'reset + seed'}`);
    const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const now = new Date();

    await reset(db, dryRun);
    if (dryRun) {
      printPlan(now);
      return 0;
    }
    if (resetOnly) return 0;

    const userIds = await createPersonas(db);
    const counts = await seed(db, userIds, now);
    printCounts('Seeded:', counts);
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    if (e instanceof SeedGuardError) return 2;
    return (e as { exitCode?: number }).exitCode ?? 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
