/**
 * @file event-prep-service.ts
 * @description P1336 — the per-registration preparation (event_preparations), the
 * once-per-person parts (person_prep_parts) and the three read-only RPCs around them.
 *
 * Privacy is the database's: event_preparations is owner + host only (RLS), and the public
 * numbers come only from get_event_prep_social_proof, which never returns an opt-out, a
 * score or volunteer data. Nothing here uses a service-role client.
 */
import { supabase } from '@/lib/supabase';
import type { EventAttendee } from '@/app/types';

export type PrepStepKey = 'plan' | 'welcome' | 'story' | 'principle' | 'cmp7' | 'stake' | 'research';
export type PrepPart = 'intro_video' | 'cognitive_video' | 'principle_intro' | 'cmp7';
export type ResearchState = 'eligible' | 'confirmed' | 'declined';
export type MicSetup = 'usbc' | 'own' | 'none';

export interface EventPreparation {
  eventId: string;
  profileId: string;
  prepChoice: 'now' | 'remind' | null;
  currentStep: PrepStepKey | null;
  stepsDone: PrepStepKey[];
  startedAt: string | null;
  completedAt: string | null;
  optedIn: boolean | null;
  principleRating: number | null;
  researchState: ResearchState | null;
  micSetup: MicSetup | null;
  researchConsentedAt: string | null;
  researchPolicyVersion: string | null;
}

export interface PrepPatch {
  prepChoice?: 'now' | 'remind' | null;
  currentStep?: PrepStepKey | null;
  stepsDone?: PrepStepKey[];
  startedAt?: string | null;
  completedAt?: string | null;
  optedIn?: boolean | null;
  principleRating?: number | null;
  researchState?: ResearchState | null;
  micSetup?: MicSetup | null;
  researchConsentedAt?: string | null;
  researchPolicyVersion?: string | null;
}

export interface PrepPartRow {
  part: PrepPart;
  contentVersion: number;
  completedAt: string | null;
  skippedAt: string | null;
}

export type SocialPerson = Pick<EventAttendee, 'profileId' | 'name' | 'slug' | 'avatarColor' | 'avatarUrl' | 'hasPledged'>;

export interface PrepSocialProof {
  preparedThis: number;
  preparedSeries: number;
  optedInThis: number;
  optedInSeries: number;
  /** Distinct people at the series' earlier events only (not this one). */
  preparedPrevious: number;
  optedInPrevious: number;
  preparedPeople: SocialPerson[];
  optedInPeople: SocialPerson[];
}

export interface HostPrepRow {
  profileId: string;
  name: string;
  slug: string;
  avatarColor?: string;
  avatarUrl?: string;
  hasPledged: boolean;
  prepChoice: 'now' | 'remind' | null;
  stepsDone: PrepStepKey[];
  startedAt: string | null;
  completedAt: string | null;
  optedIn: boolean | null;
  principleRating: number | null;
  researchState: ResearchState | null;
  micSetup: MicSetup | null;
  positionsDone: number;
  positionsTotal: number;
}

interface DbPrep {
  event_id: string;
  profile_id: string;
  prep_choice: 'now' | 'remind' | null;
  current_step: PrepStepKey | null;
  steps_done: PrepStepKey[] | null;
  started_at: string | null;
  completed_at: string | null;
  opted_in: boolean | null;
  principle_rating: number | null;
  research_state: ResearchState | null;
  mic_setup: MicSetup | null;
  research_consented_at: string | null;
  research_policy_version: string | null;
}

const PREP_COLUMNS =
  'event_id, profile_id, prep_choice, current_step, steps_done, started_at, completed_at, opted_in, principle_rating, research_state, mic_setup, research_consented_at, research_policy_version';

function mapPrep(row: DbPrep): EventPreparation {
  return {
    eventId: row.event_id,
    profileId: row.profile_id,
    prepChoice: row.prep_choice,
    currentStep: row.current_step,
    stepsDone: row.steps_done ?? [],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    optedIn: row.opted_in,
    principleRating: row.principle_rating,
    researchState: row.research_state,
    micSetup: row.mic_setup,
    researchConsentedAt: row.research_consented_at,
    researchPolicyVersion: row.research_policy_version,
  };
}

const PATCH_COLUMNS: Record<keyof PrepPatch, string> = {
  prepChoice: 'prep_choice',
  currentStep: 'current_step',
  stepsDone: 'steps_done',
  startedAt: 'started_at',
  completedAt: 'completed_at',
  optedIn: 'opted_in',
  principleRating: 'principle_rating',
  researchState: 'research_state',
  micSetup: 'mic_setup',
  researchConsentedAt: 'research_consented_at',
  researchPolicyVersion: 'research_policy_version',
};

/** Exported for the unit test: camelCase patch → the row's snake_case columns, undefined keys dropped. */
export function toDbPatch(patch: PrepPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  (Object.keys(patch) as (keyof PrepPatch)[]).forEach((k) => {
    if (patch[k] !== undefined) out[PATCH_COLUMNS[k]] = patch[k];
  });
  return out;
}

/** The caller's own preparation for an event, or null when none exists yet. Throws on a failed read
 * so a caller never mistakes "unknown" for "not started". */
export async function getMyPreparation(eventId: string, profileId: string): Promise<EventPreparation | null> {
  const { data, error } = await supabase
    .from('event_preparations')
    .select(PREP_COLUMNS)
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPrep(data as DbPrep) : null;
}

/** Creates or updates the caller's row. RLS refuses an event the caller is not registered for. */
export async function savePreparation(eventId: string, profileId: string, patch: PrepPatch): Promise<EventPreparation> {
  const { data, error } = await supabase
    .from('event_preparations')
    .upsert({ event_id: eventId, profile_id: profileId, ...toDbPatch(patch) }, { onConflict: 'event_id,profile_id' })
    .select(PREP_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error('preparation not saved');
  return mapPrep(data as DbPrep);
}

export async function getMyPrepParts(profileId: string): Promise<PrepPartRow[]> {
  const { data, error } = await supabase
    .from('person_prep_parts')
    .select('part, content_version, completed_at, skipped_at')
    .eq('profile_id', profileId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    part: r.part as PrepPart,
    contentVersion: r.content_version as number,
    completedAt: r.completed_at as string | null,
    skippedAt: r.skipped_at as string | null,
  }));
}

/** Records a once-per-person part as completed or skipped against a content version. The flow only
 * offers a part that is not completed at its current version, so a completion on the row when
 * the person skips is from an older version — the skip clears it (skipped is never completed). */
export async function markPrepPart(
  profileId: string,
  part: PrepPart,
  contentVersion: number,
  outcome: 'completed' | 'skipped',
): Promise<void> {
  const now = new Date().toISOString();
  const row =
    outcome === 'completed'
      ? { profile_id: profileId, part, content_version: contentVersion, completed_at: now, updated_at: now }
      : { profile_id: profileId, part, content_version: contentVersion, skipped_at: now, completed_at: null, updated_at: now };
  const { error } = await supabase.from('person_prep_parts').upsert(row, { onConflict: 'profile_id,part' });
  if (error) throw error;
}

const EMPTY_PROOF: PrepSocialProof = {
  preparedThis: 0,
  preparedSeries: 0,
  optedInThis: 0,
  optedInSeries: 0,
  preparedPrevious: 0,
  optedInPrevious: 0,
  preparedPeople: [],
  optedInPeople: [],
};

/** Social proof is decoration: a failed read shows nothing rather than a wrong number. */
export async function getPrepSocialProof(eventId: string): Promise<PrepSocialProof> {
  const { data, error } = await supabase.rpc('get_event_prep_social_proof', { p_event_id: eventId });
  if (error || !data) return EMPTY_PROOF;
  return { ...EMPTY_PROOF, ...(data as Partial<PrepSocialProof>) };
}

/** The room members of this event who finished preparing (the roster's check mark). null on a
 *  failed read, so the caller keeps what it already shows. */
export async function getRoomPrepared(eventId: string): Promise<ReadonlySet<string> | null> {
  const { data, error } = await supabase.rpc('get_event_room_prepared', { p_event_id: eventId });
  if (error || !Array.isArray(data)) return null;
  return new Set(data as string[]);
}

export async function getResearchPlacesLeft(eventId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('get_event_research_places_left', { p_event_id: eventId });
  if (error || typeof data !== 'number') return null;
  return data;
}

interface DbHostRow {
  profile_id: string;
  name: string;
  slug: string;
  avatar_color: string | null;
  avatar_url: string | null;
  has_pledged: boolean;
  prep_choice: 'now' | 'remind' | null;
  steps_done: PrepStepKey[] | null;
  started_at: string | null;
  completed_at: string | null;
  opted_in: boolean | null;
  principle_rating: number | null;
  research_state: ResearchState | null;
  mic_setup: MicSetup | null;
  positions_done: number;
  positions_total: number;
}

export async function getPrepHostView(eventId: string): Promise<HostPrepRow[]> {
  const { data, error } = await supabase.rpc('get_event_prep_host_view', { p_event_id: eventId });
  if (error) throw error;
  return ((data ?? []) as DbHostRow[]).map((r) => ({
    profileId: r.profile_id,
    name: r.name,
    slug: r.slug,
    avatarColor: r.avatar_color ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
    hasPledged: r.has_pledged,
    prepChoice: r.prep_choice,
    stepsDone: r.steps_done ?? [],
    startedAt: r.started_at,
    completedAt: r.completed_at,
    optedIn: r.opted_in,
    principleRating: r.principle_rating,
    researchState: r.research_state,
    micSetup: r.mic_setup,
    positionsDone: r.positions_done,
    positionsTotal: r.positions_total,
  }));
}
