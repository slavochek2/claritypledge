/**
 * @file event-mastermind-service.ts
 * @description P1529: the sales mastermind's server calls: the event's canvas per attendee, observers, the flow,
 * the update step and the host's per-person state. Every rule lives in the database; this only carries them.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { throwDbError } from './db-error-logger';
import { startCanvasRun, startQueuedCanvasRun, type RunStart } from './canvas-draft-calls';

export interface MyEventCanvas {
  name: string;
  shared: boolean;
  /** Round 1 has started: this choice can no longer be swapped. */
  fixed: boolean;
}

export async function getMyEventCanvas(eventId: string): Promise<MyEventCanvas | null> {
  const { data, error } = await supabase.rpc('get_my_event_canvas', { p_event: eventId });
  if (error) throwDbError('getMyEventCanvas', error, 'Could not load your Clarity Canvas for this event');
  return (data as MyEventCanvas | null) ?? null;
}

export type SetEventCanvasResult = { status: 'ok'; name: string } | { status: 'refused'; code: string };

export async function setEventCanvas(eventId: string, name: string): Promise<SetEventCanvasResult> {
  try {
    const { data, error } = await supabase.rpc('set_event_canvas', { p_event: eventId, p_name: name });
    if (error) throwDbError('setEventCanvas', error, 'Only a published Clarity Canvas of yours can be shared with this event.');
    return data as SetEventCanvasResult;
  } finally {
    clearListReturnCache(); // sharing changes what the Artifacts page shows
  }
}

export interface MastermindPerson {
  profileId: string;
  canvasName: string | null;
  /** The title the owner gave the canvas (the name is its URL key, often just "canvas"); null when untitled. */
  canvasTitle: string | null;
  canvasShared: boolean;
  observerOverride: boolean | null;
  participation: string | null;
  /** An observer's second answer (D24); null for everyone else. */
  observerPrep: 'home' | 'doors' | null;
  /** A registration exists. Nobody is seated without one in this flow (D24). */
  registered: boolean;
  /** 1 = first on the waiting list; null when not on it (D24). The name comes with it, as the person may not be in the room. */
  waitingPosition: number | null;
  name: string | null;
  phone: 'usbc' | 'lightning' | 'other' | null;
  recordingOn: boolean;
  lastWordsAt: string | null;
}

export async function getMastermindHostState(eventId: string): Promise<Map<string, MastermindPerson>> {
  const { data, error } = await supabase.rpc('get_mastermind_host_state', { p_event: eventId });
  if (error) throwDbError('getMastermindHostState', error, 'Could not load the room');
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return new Map(rows.map(r => [r.profile_id as string, {
    profileId: r.profile_id as string,
    canvasName: (r.canvas_name as string | null) ?? null,
    canvasTitle: (r.canvas_title as string | null) ?? null,
    canvasShared: !!r.canvas_shared,
    observerOverride: (r.observer_override as boolean | null) ?? null,
    participation: (r.participation as string | null) ?? null,
    observerPrep: (r.observer_prep as MastermindPerson['observerPrep']) ?? null,
    registered: r.registered !== false,
    waitingPosition: (r.waiting_position as number | null) ?? null,
    name: (r.name as string | null) ?? null,
    phone: (r.phone as MastermindPerson['phone']) ?? null,
    recordingOn: !!r.recording_on,
    lastWordsAt: (r.last_words_at as string | null) ?? null,
  }]));
}

/** D5: a canvas holder is a participant unless the host says observer; nobody else can be one. */
export function isCanvasHolder(person: MastermindPerson | undefined): boolean {
  return !!person?.canvasShared && person.observerOverride !== true;
}

export type RecordingState = 'off' | 'silent' | 'words';
/** Words within this long count as "arriving". A dead mic has an open session and no words. */
export const WORDS_ARRIVING_MS = 2 * 60 * 1000;

export function recordingState(person: MastermindPerson | undefined, now: number): RecordingState {
  if (!person?.recordingOn) return 'off';
  const last = person.lastWordsAt ? new Date(person.lastWordsAt).getTime() : 0;
  return now - last <= WORDS_ARRIVING_MS ? 'words' : 'silent';
}

export async function hostSetObserver(eventId: string, profileId: string, isObserver: boolean): Promise<{ status: string; code?: string }> {
  const { data, error } = await supabase.rpc('host_set_observer', { p_event: eventId, p_profile: profileId, p_is_observer: isObserver });
  if (error) throwDbError('hostSetObserver', error, 'Could not change this person');
  return data as { status: string; code?: string };
}

export async function hostSetEventFlow(eventId: string, flow: string): Promise<void> {
  const { error } = await supabase.rpc('host_set_event_flow', { p_event: eventId, p_flow: flow });
  if (error) throwDbError('hostSetEventFlow', error, error.message);
}

export async function hostStartCanvasUpdate(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('host_start_canvas_update', { p_event: eventId });
  if (error) throwDbError('hostStartCanvasUpdate', error, 'Could not start the canvas update');
}

export async function getPreviousSessionPartners(eventId: string): Promise<[string, string][]> {
  const { data, error } = await supabase.rpc('get_previous_session_partners', { p_event: eventId });
  if (error) throwDbError('getPreviousSessionPartners', error, 'Could not read the previous session');
  return (data ?? []) as [string, string][];
}

/** Evidence, never a gate: a failed record must not stop anyone opening a canvas. */
export function recordCanvasOpen(roundId: string, ownerId: string): void {
  void supabase.rpc('record_event_canvas_open', { p_round: roundId, p_owner: ownerId }).then(({ error }) => {
    if (error) console.warn('[p1529] canvas open not recorded', error.message);
  });
}

// ── The round screen (§5) and the next version (§6) ─────────────────────────────────────────────────────────────────

/** The Clarity Canvas owner of the caller's table in a round. `canvasName` is null once the canvas is no longer shared. */
export interface RoundCanvas {
  ownerProfileId: string;
  ownerSlug: string | null;
  canvasName: string | null;
  shared: boolean;
}

/** Null when the caller is not seated in that round, or the round has no owner. */
export async function getMyRoundCanvas(roundId: string): Promise<RoundCanvas | null> {
  const { data, error } = await supabase.rpc('get_my_round_canvas', { p_round: roundId });
  if (error) throwDbError('getMyRoundCanvas', error, 'Could not read this table\'s Clarity Canvas');
  const r = data as Record<string, unknown> | null;
  if (!r || typeof r.owner_profile_id !== 'string') return null;
  return {
    ownerProfileId: r.owner_profile_id,
    ownerSlug: typeof r.owner_slug === 'string' ? r.owner_slug : null,
    canvasName: typeof r.canvas_name === 'string' ? r.canvas_name : null,
    shared: r.shared === true,
  };
}

/** What a tap on "Make my next version" would answer, read before the tap (the card never learns "no recording" by tapping). */
export type NextVersionOfferState =
  | 'none' | 'round_on' | 'offer' | 'transcript_pending' | 'no_recording' | 'no_canvas' | 'started' | 'draft_open';
export interface NextVersionOffer { state: NextVersionOfferState; roundId: string | null }
const OFFER_STATES: ReadonlySet<string> = new Set(['none', 'round_on', 'offer', 'transcript_pending', 'no_recording', 'no_canvas', 'started', 'draft_open']);

export async function getMyNextVersionOffer(eventId: string): Promise<NextVersionOffer> {
  const { data, error } = await supabase.rpc('get_my_next_version_offer', { p_event: eventId });
  if (error) throwDbError('getMyNextVersionOffer', error, 'Could not read your next version');
  const r = (data ?? {}) as Record<string, unknown>;
  const state = typeof r.state === 'string' && OFFER_STATES.has(r.state) ? (r.state as NextVersionOfferState) : 'none';
  return { state, roundId: typeof r.round_id === 'string' ? r.round_id : null };
}

/**
 * Every outcome of `make_my_next_version`. `started` carries the queued run's start: the database only QUEUES the run, so
 * this reaches the `canvas-draft` function by run id, as P1536's own client does after an RPC returns one. A repeat tap has
 * no new run; it starts the draft's queued run if a lost start left one waiting (nothing queued is fine).
 */
export type NextVersionResult =
  | { status: 'started'; draftId: string; runId: string | null; repeat: boolean; start: RunStart | null }
  | { status: 'transcript_pending' | 'no_recording' | 'no_canvas' }
  | { status: 'refused'; code: string };

export async function makeMyNextVersion(roundId: string): Promise<NextVersionResult> {
  try {
    const { data, error } = await supabase.rpc('make_my_next_version', { p_round: roundId });
    if (error) throwDbError('makeMyNextVersion', error, 'Could not make your next version');
    const r = (data ?? {}) as Record<string, unknown>;
    const status = String(r.status ?? '');
    if (status === 'transcript_pending' || status === 'no_recording' || status === 'no_canvas') return { status };
    if (status === 'refused') return { status: 'refused', code: String(r.code ?? 'unknown') };
    if ((status === 'ok' || status === 'started') && typeof r.draft_id === 'string') {
      const repeat = status === 'started' || r.replayed === true;
      const runId = typeof r.run_id === 'string' ? r.run_id : null;
      const start = repeat || !runId ? await startQueuedCanvasRun(r.draft_id) : await startCanvasRun(runId);
      return { status: 'started', draftId: r.draft_id, runId, repeat, start };
    }
    return { status: 'refused', code: 'unknown' };
  } finally {
    clearListReturnCache(); // a draft now exists: the Artifacts lists change
  }
}

export type UpdateState = 'not_tapped' | 'drafting' | 'ready' | 'failed' | 'published';
const UPDATE_STATES: ReadonlySet<string> = new Set(['not_tapped', 'drafting', 'ready', 'failed', 'published']);

/** The caller's own update state. `draftId`, `revision` and `runId` are set while a draft from this evening's tap is open. */
export interface MyUpdateState { state: UpdateState; draftId: string | null; revision: number | null; runId: string | null }

export async function getMyUpdateState(eventId: string): Promise<MyUpdateState> {
  const { data, error } = await supabase.rpc('get_my_update_state', { p_event: eventId });
  if (error) throwDbError('getMyUpdateState', error, 'Could not read your next version');
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    state: typeof r.state === 'string' && UPDATE_STATES.has(r.state) ? (r.state as UpdateState) : 'not_tapped',
    draftId: typeof r.draft_id === 'string' ? r.draft_id : null,
    revision: typeof r.revision === 'number' ? r.revision : null,
    runId: typeof r.run_id === 'string' ? r.run_id : null,
  };
}

/** Host only: every canvas owner's update state, keyed by profile id. */
export async function getMastermindUpdateStates(eventId: string): Promise<Map<string, UpdateState>> {
  const { data, error } = await supabase.rpc('get_mastermind_update_states', { p_event: eventId });
  if (error) throwDbError('getMastermindUpdateStates', error, 'Could not read the owners\' next versions');
  const rows = Object.entries((data ?? {}) as Record<string, unknown>);
  return new Map(rows.map(([id, s]) => [id, typeof s === 'string' && UPDATE_STATES.has(s) ? (s as UpdateState) : 'not_tapped']));
}

/** The host's canvas-update step: on while its `afterRoundId` is still the newest round (the next round ends it by starting). */
export interface CanvasUpdateStep { afterRoundId: string | null; startedAt: string }

export async function getCanvasUpdateStep(eventId: string): Promise<CanvasUpdateStep | null> {
  const { data, error } = await supabase.from('event_canvas_update_steps').select('after_round_id, started_at').eq('event_id', eventId).maybeSingle();
  if (error) throwDbError('getCanvasUpdateStep', error, 'Could not read the canvas update step');
  const row = data as { after_round_id: string | null; started_at: string } | null;
  return row ? { afterRoundId: row.after_round_id, startedAt: row.started_at } : null;
}

/**
 * P1529: when the host ended the evening (host_end_rounds stamps it), or null. A round that ended while this is older than the
 * round's start is "between rounds", not the end of the evening. Throws on failure: callers keep what they show.
 */
export async function getEveningEnd(eventId: string): Promise<string | null> {
  const { data, error } = await supabase.from('event_evening_ends').select('ended_at').eq('event_id', eventId).maybeSingle();
  if (error) throwDbError('getEveningEnd', error, 'Could not read whether the evening has ended');
  return (data as { ended_at: string } | null)?.ended_at ?? null;
}

/** The open draft's own address parts: its canvas (what the expire read names) and its version (the workspace's `?v=`). Owner read. */
export async function getMyDraftRef(draftId: string): Promise<{ canvasId: string; versionName: string | null } | null> {
  const { data, error } = await supabase.from('canvas_drafts').select('canvas_id, version_name').eq('id', draftId).maybeSingle();
  if (error) throwDbError('getMyDraftRef', error, 'Could not read this draft');
  const row = data as { canvas_id?: unknown; version_name?: unknown } | null;
  return typeof row?.canvas_id === 'string'
    ? { canvasId: row.canvas_id, versionName: typeof row.version_name === 'string' ? row.version_name : null }
    : null;
}
