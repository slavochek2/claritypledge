/**
 * @file event-mastermind-service.ts
 * @description P1529: the sales mastermind's server calls: the event's canvas per attendee, observers, the flow,
 * the update step and the host's per-person state. Every rule lives in the database; this only carries them.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { throwDbError } from './db-error-logger';

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
  canvasShared: boolean;
  observerOverride: boolean | null;
  participation: string | null;
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
    canvasShared: !!r.canvas_shared,
    observerOverride: (r.observer_override as boolean | null) ?? null,
    participation: (r.participation as string | null) ?? null,
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
