/**
 * P1542 (founder round 3, 2026-10-23): "learn what this community is about — which community? Name it."
 * The community is the event's organising group, the same one the hike page names in "Organized by"
 * (eventsService.getEventOrganizer, P1403). Null while loading and for an event with no group, so the
 * caller's words fall back to "this community".
 */
import { useCallback, useEffect, useState } from 'react';
import { eventsService } from '@/app/data/events-service';
import { organizationsService } from '@/app/data/organizations-service';
import { whenVisible } from './when-visible';

/**
 * Round 7h: a membership request that has not settled this long after it was SENT counts as failed (null, unknown).
 * Metered-services rule 2 (timers need reasons): the Supabase fetch has no timeout, so a stalled mobile request would
 * otherwise never settle, and the hike thank-you (which holds its actions for this answer) and a resumed group terms
 * would wait forever. Counted from the send, never from mount, so a hidden tab's wait does not count; one timer per
 * request, cleared when it settles or on unmount; a late answer is ignored.
 */
export const MEMBERSHIP_READ_TIMEOUT_MS = 4000;

/** Rejects if `request` has not settled within MEMBERSHIP_READ_TIMEOUT_MS of this call (the send). */
function settleWithin<T>(request: Promise<T>, timers: Set<ReturnType<typeof setTimeout>>, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { timers.delete(timer); onTimeout?.(); reject(new Error('membership read timed out')); }, MEMBERSHIP_READ_TIMEOUT_MS);
    timers.add(timer);
    const done = () => { clearTimeout(timer); timers.delete(timer); };
    request.then((v) => { done(); resolve(v); }, (e) => { done(); reject(e); });
  });
}

/** Founder 2026-10-23: the group's name as stored ("Clarity Practice Community · Chiang Mai"), read inline
 *  without what follows " · " ("Clarity Practice Community"). */
export function shortCommunityName(name: string): string {
  return (name.split(' · ')[0] ?? '').trim() || name;
}

/** The event the hooks below ask about: its id, and its org_id when the caller's event row carries it (P1542 round
 *  10f: `null` = no group, a string = the group, undefined = not known, so the event row is read for it). */
export type EventGroupRef = { id: string; orgId?: string | null } | string | null | undefined;
/** A bare id (no event row at hand) leaves the group unknown, so it is looked up via the event. */
const refOf = (event: EventGroupRef) => (typeof event === 'string' ? { id: event, orgId: undefined } : event);

/** The event's group by the id its row carries: one request (none for an event with no group). */
function readGroup(event: { id: string; orgId?: string | null }) {
  return event.orgId ? eventsService.getOrganizationByIdOrThrow(event.orgId) : Promise.resolve(null);
}

/** undefined while the read is out (visual review round 5: callers wait rather than show the fallback first),
 *  null for an event with no group or a failed read. */
export function useEventCommunityName(event: EventGroupRef, enabled = true): string | null | undefined {
  const community = useEventCommunity(event, enabled);
  return community === undefined ? undefined : community?.name ?? null;
}

/** The event's organising group: its short name and its slug (P1595: the registered page links to the group's page).
 *  The same one read as useEventCommunityName, with the same undefined / null meanings. */
export function useEventCommunity(event: EventGroupRef, enabled = true): { name: string; slug: string | null } | null | undefined {
  // Round 10b: the answer carries the inputs it was read for; an answer for other inputs (the disabled hook's null,
  // before the read for the new inputs has even started) reads as undefined — still unknown.
  const ref = refOf(event);
  const eventId = ref?.id;
  const orgId = ref?.orgId;
  const idle = !eventId || !enabled || orgId === null;
  const key = `${eventId ?? ''}:${orgId ?? (orgId === null ? 'none' : '?')}:${enabled ? 1 : 0}`;
  const [answer, setAnswer] = useState<{ key: string; group: { name: string; slug: string | null } | null } | null>(null);
  useEffect(() => {
    setAnswer(null);
    if (!eventId || !enabled || orgId === null) { setAnswer({ key, group: null }); return; }
    let cancelled = false;
    // Round 7e (metered-services rule 3): no request from a hidden tab.
    const cancelWait = whenVisible(() => {
      (orgId !== undefined ? readGroup({ id: eventId, orgId }) : eventsService.getEventOrganizer(eventId))
        .then((org) => { if (!cancelled) setAnswer({ key, group: org?.name ? { name: shortCommunityName(org.name), slug: org.slug || null } : null }); })
        .catch(() => { if (!cancelled) setAnswer({ key, group: null }); });
    });
    return () => { cancelled = true; cancelWait(); };
  }, [eventId, orgId, enabled, key]);
  // Disabled inputs, and an event with no group, answer null on the same render. A late answer from an earlier effect
  // is already dropped: each effect's cleanup sets its `cancelled` (the request fence), and the key check covers the
  // render before it runs.
  if (idle) return null;
  return answer && answer.key === key ? answer.group : undefined;
}

/**
 * P1542 round 6 (decision 43): is the signed-in person a member of the event's organising group (M)? undefined while
 * the reads are out; false for an event with no group; null when a read FAILED (round 6b: unknown is never "not a
 * member" — callers show a member-gated offer only on a definite false; a later mount reads again).
 * Round 10f (P1527, query shape): with the group's id on the caller's event row, ONE read (the membership); the
 * group lookup is made only when the row does not carry it.
 */
export function useEventMembership(event: EventGroupRef, enabled = true, viewerId?: string | null): boolean | null | undefined {
  // Round 10b: as useEventCommunityName — an answer read for other inputs (a disabled hook's false, a previous viewer's
  // answer) is undefined for the current ones, so it is never taken for this viewer's answer.
  const ref = refOf(event);
  const eventId = ref?.id;
  const orgId = ref?.orgId;
  const idle = !eventId || !enabled || orgId === null;
  const key = `${eventId ?? ''}:${orgId ?? (orgId === null ? 'none' : '?')}:${enabled ? 1 : 0}:${viewerId ?? ''}`;
  const [answer, setAnswer] = useState<{ key: string; member: boolean | null } | null>(null);
  const setMember = useCallback((m: boolean | null | undefined) => setAnswer(m === undefined ? null : { key, member: m }), [key]);
  useEffect(() => {
    setMember(undefined);
    if (!eventId || !enabled || orgId === null) { setMember(false); return; }
    let cancelled = false;
    let cancelWait = () => {};
    const timers = new Set<ReturnType<typeof setTimeout>>();
    // Round 7e/7g (metered-services rule 3): no request from a hidden tab — the wait is before EVERY request of the
    // chain, so a tab hidden part way through sends nothing more until it is seen again (and nothing after unmount).
    // Resolves true once the tab is visible and the hook is still mounted; false once unmounted (the chain stops, and no
    // listener is left behind by a wait that would start after the cleanup ran).
    const visible = () => new Promise<boolean>((resolve) => {
      if (cancelled) { resolve(false); return; }
      cancelWait = whenVisible(() => resolve(!cancelled));
    });
    (async (): Promise<boolean | undefined> => {
      if (!(await visible())) return undefined;
      // Round 6c: the throwing read — a failed lookup lands in .catch (null, unknown), never in "no group" (false).
      // Round 10f: the group's id from the event row when it carries it; only otherwise the event's group is looked up.
      let groupId = orgId;
      if (groupId === undefined) {
        const org = await settleWithin(eventsService.getEventOrganizerOrThrow(eventId), timers);
        if (!org) return false;
        groupId = org.id;
        if (!(await visible())) return undefined;
      }
      const read = viewerId ? organizationsService.getMyMembership(groupId, viewerId) : organizationsService.getMyMembership(groupId);
      return !!(await settleWithin(read, timers));
    })()
      .then((m) => { if (!cancelled && m !== undefined) setMember(m); })
      .catch(() => { if (!cancelled) setMember(null); });
    return () => { cancelled = true; cancelWait(); timers.forEach(clearTimeout); timers.clear(); };
  }, [eventId, orgId, enabled, viewerId, setMember]);
  // Disabled inputs, and an event with no group, answer false on the same render; late answers are fenced as above.
  if (idle) return false;
  return answer && answer.key === key ? answer.member : undefined;
}

/**
 * Round 7f (metered-services rule 3): the signed-in person's membership of a group the caller has already found.
 * The close page's community lookup (org, counts, participation) does not wait on it, and it is read only once the
 * tab is visible. undefined while there is no group yet or the read is out; null when the read FAILED or did not
 * settle within MEMBERSHIP_READ_TIMEOUT_MS of the send (unknown is never "not a member", as useEventMembership).
 */
export function useOrgMembership(orgId: string | null | undefined, viewerId?: string | null): boolean | null | undefined {
  const [member, setMember] = useState<boolean | null | undefined>(undefined);
  useEffect(() => {
    setMember(undefined);
    if (!orgId) return;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const cancelWait = whenVisible(() => {
      // Round 7h: no answer within MEMBERSHIP_READ_TIMEOUT_MS of the send → null (unknown), and a late answer is ignored.
      // Round 9b: the viewer's id when known (no auth round trip before the read).
      settleWithin(viewerId ? organizationsService.getMyMembership(orgId, viewerId) : organizationsService.getMyMembership(orgId), timers)
        .then((m) => { if (!cancelled) setMember(!!m); })
        .catch(() => { if (!cancelled) setMember(null); });
    });
    return () => { cancelled = true; cancelWait(); timers.forEach(clearTimeout); timers.clear(); };
  }, [orgId, viewerId]);
  return member;
}
