/**
 * P1425: the only way edge functions change `event_rsvps.mailgun_message_ids`.
 *
 * The column is ONE jsonb object shared by every scheduled email kind. Writers used to spread the
 * object as they had read it and write the whole thing back, so a writer holding an older read
 * erased whatever another writer had stored since (2026-10-03: one reminder sent 13 times).
 * `src/tests/p1425-message-ids-writers.test.ts` fails on any whole-object write.
 *
 * Protocol for one email kind on one RSVP:
 *   claim      key absent → 'PENDING', and the kind's *_attempted_at := a fresh claim token
 *   send       Mailgun
 *   write-back 'PENDING' → id (or → absent on a Mailgun failure, so the next tick retries),
 *              ONLY while *_attempted_at still equals this claim's token. A reset or a takeover
 *              changes the token, so an old write-back can never land on somebody else's claim.
 *   takeover   a claim older than the kind's stuck threshold is taken over — but first the send
 *              log is consulted: if this claim's send was recorded, the id is repaired from it and
 *              nothing is re-sent. (Only a send whose log insert ALSO failed can repeat.)
 */
import { type SupabaseClient } from './email-helpers.ts';

export type MessageKind = 'reminder' | 'feedback' | 'starting_soon';
type MessageKey = MessageKind | 'starting_soon_for';
type Patch = Partial<Record<MessageKey, string | null>>;

/** ok = the row changed · conflict = the expected state no longer holds · error = RPC failed */
export type CasResult = 'ok' | 'conflict' | 'error';

/**
 * Per-key compare-and-set, executed by the `set_rsvp_message_ids` database function in one UPDATE:
 *
 *   - applies only if `mailgun_message_ids->>key` still equals `expected` (null = absent)
 *   - changes only the keys in `patch` (string sets, null removes); every other key is untouched,
 *     so a caller holding an old read of the row cannot erase a sibling's id
 *   - `attemptedAt` (when given, even as null) is written to the kind's *_attempted_at column
 *   - `attemptedWas` (when given) additionally requires that column to still hold that value
 *   - `scheduledFor` (claims) requires the schedule the caller computed from to still hold — the
 *     kind's *_scheduled_at, or the event's start for starting_soon — and the event not cancelled,
 *     so a tick acting on a read from before an edit or a cancel claims nothing
 *
 * An RPC error is reported as 'error', never as 'conflict': a dead RPC (migration missing, outage)
 * must show up in the cron's error count, not read as "someone else has it".
 */
export async function setMessageIds(
  supabase: SupabaseClient,
  rsvpId: string,
  key: MessageKind,
  expected: string | null,
  patch: Patch,
  opts: { attemptedAt?: string | null; attemptedWas?: string | null; scheduledFor?: string } = {},
): Promise<CasResult> {
  const { data, error } = await supabase.rpc('set_rsvp_message_ids', {
    p_rsvp_id: rsvpId,
    p_key: key,
    p_expected: expected,
    p_patch: patch,
    p_set_attempted: opts.attemptedAt !== undefined,
    p_attempted_at: opts.attemptedAt ?? null,
    p_match_attempted: opts.attemptedWas !== undefined,
    p_attempted_was: opts.attemptedWas ?? null,
    p_scheduled_for: opts.scheduledFor ?? null,
  });
  if (error) {
    console.error(`set_rsvp_message_ids(${rsvpId}, ${key}) failed: ${error.message}`);
    return 'error';
  }
  return data === true ? 'ok' : 'conflict';
}

export type ClaimResult =
  | { status: 'claimed'; token: string }
  | { status: 'held' } // another live claim, or already sent
  | { status: 'repaired' } // a stuck claim whose send WAS recorded: id restored, nothing to send
  | { status: 'error' };

/**
 * A claim token: the claim time with random microseconds (timestamptz holds µs). Two overlapping
 * cron invocations can capture the same millisecond; the random tail keeps their tokens distinct,
 * so a late write-back cannot match a later claim that happened to start in the same ms.
 */
export function claimToken(now: Date): string {
  const micros = String(crypto.getRandomValues(new Uint16Array(1))[0] % 1000).padStart(3, '0');
  return now.toISOString().replace(/Z$/, `${micros}Z`);
}

/**
 * Claim one kind on one RSVP for sending. `current`, `attemptedAt` and `scheduledFor` are what the
 * caller read; the database re-checks all three, so a stale read can only lose the claim, never
 * double it or send under an old schedule.
 */
export async function claimMessage(
  supabase: SupabaseClient,
  rsvp: { id: string; event_id: string; profile_id: string | null },
  key: MessageKind,
  current: string | null | undefined,
  attemptedAt: string | null,
  now: Date,
  stuckMs: number,
  /** The kind's *_scheduled_at as read (starting_soon: the event's start). */
  scheduledFor: string,
  /** Extra keys written with the claim and kept when a stuck claim is repaired (starting_soon_for). */
  extra: Patch = {},
): Promise<ClaimResult> {
  const token = claimToken(now);
  const asClaim = (r: CasResult): ClaimResult =>
    r === 'ok' ? { status: 'claimed', token } : r === 'error' ? { status: 'error' } : { status: 'held' };

  if (current == null) {
    return asClaim(await setMessageIds(supabase, rsvp.id, key, null, { ...extra, [key]: 'PENDING' }, {
      attemptedAt: token,
      scheduledFor,
    }));
  }
  if (current !== 'PENDING') return { status: 'held' }; // a real id: already sent

  const stuck = !attemptedAt || now.getTime() - new Date(attemptedAt).getTime() > stuckMs;
  if (!stuck) return { status: 'held' };

  // Stuck. Did the claimer's send actually go out (its write-back failed, or it died after)?
  // Only a send logged under THIS claim's token counts: any other send belongs to another claim (a
  // previous schedule an edit cancelled), and restoring its id would block the replacement for good.
  if (attemptedAt && rsvp.profile_id) {
    const { data: logged, error } = await supabase
      .from('email_send_log')
      .select('mailgun_message_id')
      .eq('event_id', rsvp.event_id)
      .eq('profile_id', rsvp.profile_id)
      .eq('email_type', key)
      .eq('status', 'sent')
      .eq('claim_token', attemptedAt)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error(`send-log read failed for rsvp ${rsvp.id} (${key}): ${error.message}`);
      return { status: 'error' }; // never re-send on a guess
    }
    const loggedId = logged?.mailgun_message_id as string | null | undefined;
    if (loggedId) {
      const r = await setMessageIds(supabase, rsvp.id, key, 'PENDING', { ...extra, [key]: loggedId }, {
        attemptedWas: attemptedAt,
      });
      return r === 'ok' ? { status: 'repaired' } : r === 'error' ? { status: 'error' } : { status: 'held' };
    }
  }

  // Not recorded as sent: take the claim over, but only if it is STILL that same stuck claim —
  // attempted_at must still be what we read, NULL included, so two overlapping ticks cannot both
  // take over one claim.
  return asClaim(await setMessageIds(supabase, rsvp.id, key, 'PENDING', { ...extra, [key]: 'PENDING' }, {
    attemptedAt: token,
    attemptedWas: attemptedAt,
    scheduledFor,
  }));
}

/**
 * Write the outcome over our own claim only (PENDING + our token). One retry on an RPC error: a
 * write-back that never lands leaves the claim to the stuck path, which repairs it from the send
 * log rather than re-sending.
 */
export async function writeBackMessage(
  supabase: SupabaseClient,
  rsvpId: string,
  key: MessageKind,
  token: string,
  patch: Patch,
): Promise<CasResult> {
  let r = await setMessageIds(supabase, rsvpId, key, 'PENDING', patch, { attemptedWas: token });
  if (r === 'error') r = await setMessageIds(supabase, rsvpId, key, 'PENDING', patch, { attemptedWas: token });
  if (r === 'conflict') {
    console.warn(`write-back for rsvp ${rsvpId} (${key}) found no claim of ours — reset or taken over meanwhile`);
  }
  return r;
}

/**
 * Clear kinds whose scheduled emails were withdrawn (event edited; cancelled then uncancelled), so
 * the cron schedules them again. Replaces the old whole-object reset, which wrote `{}` from a read
 * taken seconds earlier and so erased an id the cron had stored in between — a duplicate send.
 *
 * Reads the row fresh and clears each key with a compare-and-set against what it read (retrying
 * on a conflict). A real id that appeared since the caller's own read was scheduled under the old
 * details, so it is handed to `cancel` before its key is cleared. Each clear also requires the
 * kind's *_attempted_at to be what was read, so a delayed reset cannot clear a NEWER claim made
 * after its read; clearing nulls that column, so an in-flight claimer's write-back lands nowhere.
 *
 * `keepStartingSoonFor`: a starting-soon email for exactly this start is kept — sent OR still being
 * sent (the claim records `starting_soon_for` up front) — so an edit that left the start alone never
 * sends "starting in 15 minutes" twice (P1380). Reminder/feedback are always rescheduled on an edit
 * (their content carries the event details); a claim in flight at that moment is P947's accepted race.
 */
export async function clearMessageIds(
  supabase: SupabaseClient,
  rsvpId: string,
  kinds: MessageKind[],
  cancel: (id: string) => Promise<void>,
  opts: { keepStartingSoonFor?: string; alreadyCancelled?: Set<string> } = {},
): Promise<CasResult> {
  const cancelled = opts.alreadyCancelled ?? new Set<string>();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from('event_rsvps')
      .select('mailgun_message_ids, reminder_attempted_at, feedback_attempted_at, starting_soon_attempted_at')
      .eq('id', rsvpId)
      .maybeSingle();
    if (error) {
      console.error(`clearMessageIds read failed for rsvp ${rsvpId}: ${error.message}`);
      return 'error';
    }
    const ids = (data?.mailgun_message_ids ?? {}) as Record<string, string | null>;
    const attempted = (kind: MessageKind) =>
      ((data as Record<string, string | null> | null)?.[`${kind}_attempted_at`] ?? null);
    let settled = true;
    for (const kind of kinds) {
      const v = ids[kind];
      if (v == null) continue;
      if (kind === 'starting_soon' && opts.keepStartingSoonFor && ids.starting_soon_for === opts.keepStartingSoonFor) {
        continue;
      }
      if (v !== 'PENDING' && !cancelled.has(v)) {
        await cancel(v);
        cancelled.add(v);
      }
      const patch: Patch = kind === 'starting_soon' ? { starting_soon: null, starting_soon_for: null } : { [kind]: null };
      const cas = { attemptedAt: null, attemptedWas: attempted(kind) };
      let r = await setMessageIds(supabase, rsvpId, kind, v, patch, cas);
      if (r === 'error') r = await setMessageIds(supabase, rsvpId, kind, v, patch, cas);
      if (r === 'error') return 'error';
      if (r === 'conflict') settled = false;
    }
    if (settled) return 'ok';
  }
  console.error(`clearMessageIds gave up on rsvp ${rsvpId}: the row kept changing`);
  return 'conflict';
}
