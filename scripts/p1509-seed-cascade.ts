/**
 * @file p1509-seed-cascade.ts
 * @description P1509 v16: what a persona reset would take with it. The foreign-key graph is DERIVED from the
 * migrations (p1509-fk-graph.ts); this file holds the one thing a graph cannot say, a human ruling per edge:
 *
 *   deleted-first  the reset deletes these rows itself, persona-owned only (RESET_ORDER in the seed script)
 *   persona-only   a row on this edge is keyed to the persona being deleted, or hangs off rows the preflight already
 *                  requires to be persona-owned, so nothing owned by anyone else can be in it
 *   set-null       the reference is nulled and the row stays (checked: the column is nullable and no UPDATE trigger
 *                  on the table fires on it)
 *   set-null-trigger-reviewed  as set-null, but an UPDATE trigger does fire; the reason says why it is harmless
 *   guarded        a row on this edge can belong to someone else; the preflight counts such rows and aborts
 *
 * A vitest derives the edge list from the real migrations and fails if an edge is missing from this map, or an entry
 * names an edge that no longer exists, so a new foreign key cannot slip past the reset unnoticed. The seed script
 * repeats that check at run time and refuses to start on a divergence.
 *
 * The preflight is read-only and runs before the first delete. It is not atomic with the deletes (see the seed
 * script's header: known limitation).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PERSONA_IDS, personaEmail } from '../src/app/prototypes/clarity-chat-v16/personas';
import { edgeKey, triggersTouching, type FkEdge, type FkGraph, type Referrers } from './p1509-fk-graph';

export type SetName = 'users' | 'events' | 'points' | 'stories' | 'letters' | 'docs' | 'deliveries' | 'versions';

export interface Owner {
  /** A column on the child row naming who owns it. */
  col: string;
  /** Which persona-owned set that column must fall in (default: persona users). */
  set?: SetName;
}

export type Ruling =
  | { cls: 'deleted-first'; why: string }
  | { cls: 'persona-only'; why: string }
  | { cls: 'set-null'; why: string }
  | { cls: 'set-null-trigger-reviewed'; why: string }
  /** `owners` absent: any row on the edge counts (it blocks, or is cascaded, and nothing in the reset removes it).
   * Present: a row counts when ANY owner column is NULL or outside its persona set. */
  | { cls: 'guarded'; why: string; owners?: Owner[] };

const df = (why: string): Ruling => ({ cls: 'deleted-first', why });
const po = (why: string): Ruling => ({ cls: 'persona-only', why });
const sn = (why: string): Ruling => ({ cls: 'set-null', why });
const snr = (why: string): Ruling => ({ cls: 'set-null-trigger-reviewed', why });
const gd = (why: string, ...owners: Owner[]): Ruling => ({ cls: 'guarded', why, ...(owners.length ? { owners } : {}) });
const own = (col: string, set?: SetName): Owner => (set ? { col, set } : { col });

const ACCOUNT = 'row keyed to the persona account being deleted';
const INDUCTION = 'hangs off rows the preflight requires to be persona-owned';
const BLOCKS = 'no step of the reset removes it, so it would block the account delete';

/** child.column->parent  =>  ruling. Keys are derived from the migrations; see the header. */
export const CASCADE_CLASSIFICATION: Readonly<Record<string, Ruling>> = {
  // ── account edges: parent is the persona's profile or auth user ──
  'agent_accounts.profile_id->profiles': po(ACCOUNT),
  'ai_rate_limits.user_id->auth.users': po(ACCOUNT),
  'search_rate_limits.user_id->profiles': po(ACCOUNT),
  'topic_ratings.user_id->auth.users': po(ACCOUNT),
  'topic_suggestions.user_id->auth.users': po(ACCOUNT),
  'topic_vote_prefs.user_id->auth.users': po(ACCOUNT),
  'user_voice_profiles.user_id->auth.users': po(ACCOUNT),
  'person_prep_parts.profile_id->profiles': po(ACCOUNT),
  'witnesses.profile_id->profiles': gd('an endorsement a non-persona (or an anonymous witness) added to a persona profile', own('witness_profile_id')),
  'witnesses.witness_profile_id->profiles': gd(`a witness record naming a persona: ${BLOCKS}`),
  'profiles.id->auth.users': po('the persona profile itself'),
  'badge_points.user_id->profiles': po(ACCOUNT),
  'badge_points.verified_by->profiles': sn('verifier attribution is nulled'),
  'calendar_source_suggestions.submitted_by->auth.users': sn('submitter attribution is nulled'),
  'topic_candidates.created_by->auth.users': sn('creator attribution is nulled'),
  'series_reviews.author_profile_id->profiles': sn('author attribution is nulled'),
  'membership.invited_by->profiles': sn('who-invited-whom attribution is nulled'),
  'membership.user_id->profiles': df('plain members deleted by the reset; organizer rows go with the account (P1193 passes cascades)'),
  'clarity_agreements.creator_profile_id->profiles': df('agreements a persona created are deleted by the reset'),
  'clarity_agreements.partner_profile_id->profiles': gd(`an agreement a non-persona created with a persona partner: ${BLOCKS}`, own('creator_profile_id')),
  'clarity_agreements.terminated_by->profiles': snr('the lock triggers (agreements_lock_party_ids, pin_agreement_version) apply only to the anon and authenticated roles; the FK action runs as the table owner. Only an agreement a persona is party to can name a persona here, and those are deleted (creator) or stop the reset (partner) first'),
  'clarity_docs.owner_id->profiles': df('docs a persona owns are deleted by the reset'),
  'clarity_letters.sender_id->profiles': df('letters a persona sent are deleted by the reset'),
  'clarity_live_invites.target_user_id->profiles': gd('an invite a non-persona session creator sent to a persona (the insert policy lets any session creator invite anyone); an invite from a persona session is stopped by the clarity_sessions rulings'),
  'clarity_sessions.creator_profile_id->profiles': gd(`a live session a persona created: ${BLOCKS}`),
  'clarity_sessions.joiner_profile_id->profiles': gd(`a live session a persona joined: ${BLOCKS}`),
  'clarity_sessions.target_listener_id->profiles': gd(`a live session aimed at a persona: ${BLOCKS}`),
  'email_send_log.profile_id->profiles': gd(`a mail log row for a persona: ${BLOCKS}`),
  'event_arrivals.profile_id->profiles': po(ACCOUNT),
  'event_feedback.user_id->profiles': po(ACCOUNT),
  'event_practice_rooms.creator_id->profiles': po(ACCOUNT),
  'event_preparations.profile_id->profiles': df('preparations a persona filed are deleted by the reset, before their RSVPs (see event_preparations.rsvp_id)'),
  'event_room_members.profile_id->profiles': sn('the member row stays, unattributed; only persona-event members are deleted, and those must be persona-owned'),
  'event_rsvps.profile_id->profiles': df('RSVPs a persona made are deleted by the reset'),
  'event_sub_rooms.initiator_id->profiles': gd('a sub-room a persona started with someone else; the cascade deletes it for both', own('target_id')),
  'event_sub_rooms.target_id->profiles': gd('a sub-room someone else started with a persona; the cascade deletes it for both', own('initiator_id')),
  'events.host_id->profiles': df('events a persona hosts are deleted by the reset'),
  'personal_ask_answers.user_id->profiles': po(ACCOUNT),
  'point_position_history.user_id->profiles': po(ACCOUNT),
  'point_positions.user_id->profiles': df('positions a persona holds are deleted by the reset'),
  'points.first_validator_id->profiles': df('points a persona authored are deleted by the reset'),
  'stories.author_id->profiles': df('stories a persona authored are deleted by the reset'),
  'story_explain_backs.recorder_id->profiles': gd(`an explain-back a persona recorded on a delivery that is not on a persona letter: ${BLOCKS}`, own('delivery_id', 'deliveries')),
  'story_point_history.user_id->profiles': po(ACCOUNT),
  'story_points.author_id->profiles': df('story-to-point links a persona made are deleted by the reset'),
  'story_verifications.listener_id->profiles': gd(`a /live verification a persona listened to: ${BLOCKS}`),
  'story_verifications.speaker_id->profiles': gd(`a /live verification a persona spoke in: ${BLOCKS}`),
  'letter_deliveries.receiver_profile_id->profiles': gd(`a delivery to a persona on a letter a persona did not send; deliveries on persona letters cascade away with the letter: ${BLOCKS}`, own('letter_id', 'letters')),
  'letter_response_pending.user_id->auth.users': po(ACCOUNT),
  'transcribe_room_members.profile_id->profiles': po(ACCOUNT),

  // ── events ──
  'email_send_log.event_id->events': gd(`a mail log row for a persona event: ${BLOCKS}`),
  'event_arrivals.event_id->events': gd('an arrival a non-persona logged at a persona event', own('profile_id')),
  'event_feedback.event_id->events': gd('feedback a non-persona gave on a persona event', own('user_id')),
  'event_practice_rooms.event_id->events': gd('a practice room a non-persona opened at a persona event', own('creator_id')),
  'event_preparations.event_id->events': gd('a preparation a non-persona filed for a persona event (it can outlive its RSVP)', own('profile_id')),
  'event_preparations.rsvp_id->event_rsvps': snr('p1336_prep_guard pins rsvp_id to its old value on every UPDATE, so SET NULL cannot take effect and an RSVP that a preparation still names could not be deleted. The reset therefore deletes persona preparations before persona RSVPs; a preparation always names the RSVP of its own (event, profile), so a non-persona preparation never names a persona RSVP except on a persona event, which event_preparations.event_id guards.'),
  'event_private_info.event_id->events': po('private details the host stored for their own event'),
  'event_room_members.event_id->events': gd('a room member that is not a persona (or has no profile) at a persona event', own('profile_id')),
  'event_rounds.event_id->events': po('rounds belong to the event host; host_start_round (host only) creates them'),
  'event_round_presence.event_id->events': po(INDUCTION),
  'event_rsvps.event_id->events': gd('an RSVP a non-persona (or an anonymous one) made to a persona event', own('profile_id')),
  'event_sub_rooms.event_id->events': gd('a sub-room at a persona event with a non-persona party', own('initiator_id'), own('target_id')),
  'personal_ask_answers.event_id->events': gd('an answer a non-persona gave at a persona event', own('user_id')),
  'transcribe_rooms.event_id->events': gd('a transcribe room linked to a persona event. The FK would null event_id, but transcribe_rooms_guard_immutable_columns raises on any event_id change, so the room blocks the event delete'),

  // ── event children (hang off rows already required to be persona-owned) ──
  'event_email_links.rsvp_id->event_rsvps': po(INDUCTION),
  'event_room_answers.room_member_id->event_room_members': po(INDUCTION),
  'event_round_presence.room_member_id->event_room_members': po(INDUCTION),
  'event_round_seats.room_member_id->event_room_members': po(INDUCTION),
  'event_round_seats.round_id->event_rounds': po('seats are written only by host_start_round, whose p1337_assert_valid_seats requires every seated member to belong to the round\'s own event; members of persona events are guarded above'),
  'event_round_tables.round_id->event_rounds': po(INDUCTION),
  'event_round_tables.topic_point_id->points': sn('the table keeps its row, without a topic'),
  'event_round_tables.topic_set_by->event_room_members': sn('the table keeps its row, unattributed'),
  'transcribe_messages.member_id->transcribe_room_members': po(INDUCTION),
  'transcribe_room_transcription_jobs.member_id->transcribe_room_members': po(INDUCTION),

  // ── points ──
  'badge_points.point_id->points': gd('a badge a non-persona holds on a persona point', own('user_id')),
  'point_position_history.point_id->points': gd('position history a non-persona has on a persona point (a withdrawn position leaves history only)', own('user_id')),
  'point_positions.point_id->points': gd('a position a non-persona holds on a persona point', own('user_id')),
  'points.superseded_by->points': snr('trg_enforce_supersede_invariants fires on UPDATE OF superseded_by but returns at once when the new value is NULL; trg_points_updated_at and the visibility and system-tag triggers do not touch this column'),
  'story_point_history.point_id->points': gd('link history a non-persona has on a persona point', own('user_id')),
  'story_points.point_id->points': gd('a link a non-persona made to a persona point', own('author_id')),
  'letter_point_responses.point_id->points': gd(`a letter response on a persona point from a delivery that is not on a persona letter: ${BLOCKS}`, own('delivery_id', 'deliveries')),

  // ── stories, versions, docs ──
  'badge_points.story_id->stories': gd('a badge a non-persona holds on a persona story', own('user_id')),
  'doc_stories.story_id->stories': gd('a persona story inside a doc a non-persona owns', own('doc_id', 'docs')),
  'story_point_history.story_id->stories': gd('link history a non-persona has on a persona story', own('user_id')),
  'story_points.story_id->stories': gd('a link a non-persona made from a persona story', own('author_id')),
  'story_verifications.story_id->stories': gd('a /live verification of a persona story involving a non-persona', own('speaker_id'), own('listener_id')),
  'story_verifications.version_id->story_versions': gd('a /live verification of a persona story version involving a non-persona', own('speaker_id'), own('listener_id')),
  'story_versions.story_id->stories': po('versions of a persona story'),
  'clarity_sessions.source_story_id->stories': gd(`a live session sourced from a persona story: ${BLOCKS}`),
  'letter_predictions.story_id->stories': gd(`a prediction about a persona story on a letter a persona did not send: ${BLOCKS}`, own('letter_id', 'letters')),
  'letter_story_snapshots.story_id->stories': gd(`a snapshot of a persona story in a letter a persona did not send: ${BLOCKS}`, own('letter_id', 'letters')),
  'letter_story_snapshots.version_id->story_versions': gd(`a snapshot of a persona story version in a letter a persona did not send: ${BLOCKS}`, own('letter_id', 'letters')),
  'doc_stories.doc_id->clarity_docs': po('the story list of a persona doc'),
  'clarity_letters.source_doc_id->clarity_docs': gd(`a letter a non-persona sent from a persona doc: ${BLOCKS}`, own('sender_id')),

  // ── letters and deliveries ──
  'clarity_sessions.source_letter_id->clarity_letters': gd(`a live session sourced from a persona letter: ${BLOCKS}`),
  'letter_deliveries.letter_id->clarity_letters': gd('a delivery of a persona letter to a non-persona (or to a link respondent)', own('receiver_profile_id')),
  'letter_predictions.letter_id->clarity_letters': po('the sender\'s own predictions: the INSERT policy is WITH CHECK (false), so only the seal RPC writes them'),
  'letter_response_pending.letter_id->clarity_letters': gd('a pending response a non-persona started on a persona letter', own('user_id')),
  'letter_story_snapshots.letter_id->clarity_letters': po('the snapshots a persona letter was sealed with'),
  'letter_point_responses.delivery_id->letter_deliveries': po(INDUCTION),
  'letter_predictions.delivery_id->letter_deliveries': po(INDUCTION),
  'story_explain_backs.delivery_id->letter_deliveries': gd('an explain-back a non-persona recorded on a delivery of a persona letter', own('recorder_id')),
  'story_explain_backs.letter_id,story_id->letter_story_snapshots': po(INDUCTION),
  'story_verifications.delivery_id->letter_deliveries': sn('the verification keeps its row, unlinked'),
};

// ───────────────────────────── derivation checks ─────────────────────────────

export interface CoverageReport {
  /** Derived edges with no ruling: a foreign key the reset has never been judged against. */
  unclassified: FkEdge[];
  /** Rulings whose edge is no longer derived: a stale entry. */
  stale: string[];
}

export function classificationCoverage(referrers: Referrers, rulings: Readonly<Record<string, Ruling>> = CASCADE_CLASSIFICATION): CoverageReport {
  const derived = new Set(referrers.edges.map(edgeKey));
  return {
    unclassified: referrers.edges.filter((e) => !(edgeKey(e) in rulings)),
    stale: Object.keys(rulings).filter((k) => !derived.has(k)),
  };
}

// ───────────────────────────── preflight ─────────────────────────────

export const SET_SOURCES: Readonly<Record<Exclude<SetName, 'users'>, { table: string; col: string; from: SetName }>> = {
  events: { table: 'events', col: 'host_id', from: 'users' },
  points: { table: 'points', col: 'first_validator_id', from: 'users' },
  stories: { table: 'stories', col: 'author_id', from: 'users' },
  letters: { table: 'clarity_letters', col: 'sender_id', from: 'users' },
  docs: { table: 'clarity_docs', col: 'owner_id', from: 'users' },
  deliveries: { table: 'letter_deliveries', col: 'letter_id', from: 'letters' },
  versions: { table: 'story_versions', col: 'story_id', from: 'stories' },
};
/** Which persona-owned set an edge's parent table is. */
export const PARENT_SET: Readonly<Record<string, SetName>> = {
  profiles: 'users', 'auth.users': 'users', events: 'events', points: 'points', stories: 'stories',
  clarity_letters: 'letters', clarity_docs: 'docs', letter_deliveries: 'deliveries', story_versions: 'versions',
};

const CHUNK = 100;
/** A NOT IN list travels in the URL, so a set larger than this cannot be checked in one request. Fail closed. */
export const MAX_OWNER_SET = 150;
const chunks = <T>(xs: readonly T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

type Db = SupabaseClient;

/** Ids of the rows in `table` whose `col` is in `values`, read to exhaustion (page after page, ordered by id). */
export async function fetchIds(db: Db, table: string, col: string, values: readonly string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const chunk of chunks(values, CHUNK)) {
    // Page until an EMPTY page, and advance by what came back: a server that caps a page below 1000 rows must not
    // make the scan stop early or skip rows.
    let from = 0;
    for (;;) {
      const { data, error } = await db.from(table).select('id').in(col, chunk).order('id').range(from, from + 999);
      if (error) throw new Error(`preflight ${table}: ${error.message}`);
      const rows = (data ?? []) as { id: string }[];
      if (rows.length === 0) break;
      ids.push(...rows.map((r) => r.id));
      from += rows.length;
    }
  }
  return ids;
}

export type PersonaSets = Record<SetName, string[]>;

export async function resolveSets(db: Db, userIds: readonly string[]): Promise<PersonaSets> {
  const sets: Partial<PersonaSets> = { users: [...userIds] };
  for (const name of ['events', 'points', 'stories', 'letters', 'docs', 'deliveries', 'versions'] as const) {
    const src = SET_SOURCES[name];
    sets[name] = await fetchIds(db, src.table, src.col, (sets[src.from] as string[]));
  }
  return sets as PersonaSets;
}

/** PostgREST `or` filter: true for a row that is NOT owned by a persona, per any of its owner columns. Null means
 * "every row counts" (an owner set is empty, so any value is foreign). */
export function foreignOwnerFilter(owners: readonly Owner[], sets: PersonaSets): string | null {
  const parts: string[] = [];
  for (const o of owners) {
    const ids = sets[o.set ?? 'users'];
    if (ids.length === 0) return null;
    if (ids.length > MAX_OWNER_SET) {
      throw new Error(`preflight: ${ids.length} persona ${o.set ?? 'users'} rows is too many to verify ownership of ${o.col} in one request; clean them up first`);
    }
    parts.push(`${o.col}.is.null`, `${o.col}.not.in.(${ids.join(',')})`);
  }
  return parts.join(',');
}

export interface PreflightProblem { edge: string; onDelete: string; count: number; why: string }

/** Counts, per guarded edge, the rows the reset would cascade into or be blocked by that a persona does not own. */
export async function cascadePreflight(
  db: Db,
  userIds: readonly string[],
  referrers: Referrers,
  rulings: Readonly<Record<string, Ruling>> = CASCADE_CLASSIFICATION,
): Promise<PreflightProblem[]> {
  const coverage = classificationCoverage(referrers, rulings);
  if (coverage.unclassified.length > 0 || coverage.stale.length > 0) {
    throw new Error(
      `Cascade classification is out of date; refusing to reset.\n  unclassified: ${coverage.unclassified.map(edgeKey).join(', ') || 'none'}\n  stale: ${coverage.stale.join(', ') || 'none'}`,
    );
  }
  if (userIds.length === 0) return [];
  const sets = await resolveSets(db, userIds);
  const problems: PreflightProblem[] = [];
  for (const edge of referrers.edges) {
    const key = edgeKey(edge);
    const ruling = rulings[key] as Ruling;
    if (ruling.cls !== 'guarded') continue;
    if (edge.columns.length !== 1) throw new Error(`preflight: ${key} is guarded but composite; give it a ruling that does not need a column filter`);
    const parentSet = PARENT_SET[edge.parent];
    if (!parentSet) throw new Error(`preflight: no persona set for parent table ${edge.parent} (${key})`);
    const parentIds = sets[parentSet];
    if (parentIds.length === 0) continue;
    const filter = ruling.owners ? foreignOwnerFilter(ruling.owners, sets) : null;
    let count = 0;
    for (const chunk of chunks(parentIds, CHUNK)) {
      let q = db.from(edge.child).select('*', { count: 'exact', head: true }).in(edge.columns[0] as string, chunk);
      if (filter) q = q.or(filter);
      const { count: n, error } = await q;
      if (error) throw new Error(`preflight ${edge.child}.${edge.columns[0]}: ${error.message}`);
      if (typeof n !== 'number') throw new Error(`preflight ${edge.child}.${edge.columns[0]}: the server returned no row count; refusing to read that as zero`);
      count += n;
    }
    if (count > 0) problems.push({ edge: key, onDelete: edge.onDelete, count, why: ruling.why });
  }
  problems.push(...(await agreementPartnerGuard(db, userIds)));
  return problems;
}

/**
 * The reset deletes an agreement on its creator alone, so the other party has to be checked here: a persona-created
 * agreement whose partner is a real account (partner_profile_id set and not a persona) or a real address
 * (partner_email not a persona address) would be deleted from under that person.
 */
export async function agreementPartnerGuard(db: Db, userIds: readonly string[]): Promise<PreflightProblem[]> {
  if (userIds.length === 0) return [];
  const emails = PERSONA_IDS.map((id) => personaEmail(id));
  if (userIds.length > MAX_OWNER_SET) throw new Error('preflight: too many persona accounts to verify agreement partners');
  const foreign = `and(partner_profile_id.not.is.null,partner_profile_id.not.in.(${userIds.join(',')})),partner_email.not.in.(${emails.join(',')})`;
  const { count, error } = await db.from('clarity_agreements').select('*', { count: 'exact', head: true }).in('creator_profile_id', [...userIds]).or(foreign);
  if (error) throw new Error(`preflight clarity_agreements: ${error.message}`);
  if (typeof count !== 'number') throw new Error('preflight clarity_agreements: the server returned no row count; refusing to read that as zero');
  return count > 0
    ? [{ edge: 'clarity_agreements.creator_profile_id (deleted by the reset)', onDelete: 'DELETE', count, why: 'an agreement a persona created with someone who is not a persona; the reset would delete it from under them' }]
    : [];
}

/**
 * Every ON DELETE SET NULL edge claims "the row stays". Check what the claim rests on: the column must be nullable
 * (a NOT NULL column makes the action fail), and an UPDATE trigger on the table that fires on the column can refuse or
 * undo the null, so a plain `set-null` ruling is not enough there.
 */
export function setNullProblems(g: FkGraph, referrers: Referrers, rulings: Readonly<Record<string, Ruling>> = CASCADE_CLASSIFICATION): string[] {
  const problems: string[] = [];
  for (const e of referrers.edges) {
    if (e.onDelete !== 'SET NULL' && e.onDelete !== 'SET DEFAULT') continue;
    const key = edgeKey(e);
    const ruling = rulings[key];
    if (!ruling || ruling.cls === 'deleted-first') continue; // unclassified is reported elsewhere; deleted-first rows are gone before the action
    const notNull = e.columns.filter((c) => g.notNull.has(`${e.child}.${c}`));
    if (notNull.length > 0) problems.push(`${key}: ${e.onDelete} on NOT NULL column ${notNull.join(', ')}; the action would fail`);
    if (ruling.cls === 'set-null') {
      const hits = e.columns.flatMap((c) => triggersTouching(g, e.child, c));
      if (hits.length > 0) {
        problems.push(`${key}: ruled set-null, but ${[...new Set(hits.map((t) => `${t.timing} ${t.name}`))].join(', ')} fire on UPDATE of it; rule it set-null-trigger-reviewed (with the reason) or guarded`);
      }
    }
  }
  return problems;
}

export function describeProblems(problems: readonly PreflightProblem[]): string {
  return problems.map((p) => `${p.edge} (ON DELETE ${p.onDelete}): ${p.count} row(s), ${p.why}`).join('\n  - ');
}
