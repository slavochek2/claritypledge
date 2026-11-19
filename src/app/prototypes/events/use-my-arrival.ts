/**
 * @file use-my-arrival.ts
 * @description P1529 UAT round 1: the person's own role and arrival time in a flow that asks. An owner makes a canvas (25 minutes of
 * preparation), an observer prepares (10); someone who chose to prepare at the event comes at the doors time, everyone else at the
 * start. `undefined` while the read is out; `null` for any event or person without answers.
 */
import { useCallback, useEffect, useState } from 'react';
import { getMyRegistrationRole } from '@/app/data/my-registration-answers';
import { getMyHikeWhen } from '@/app/data/my-hike-when';
import { comesAtDoors } from '@/app/data/registration-answer-model';
import { recipeForEvent } from './series-recipes';
import { whenVisible } from './when-visible';

export interface MyArrival {
  owner: boolean;
  atDoors: boolean;
}

/** Pure: the arrival from the answers. */
export function arrivalOf(role: { participation: string | null; observerPrep: string | null } | null): MyArrival | null {
  if (!role?.participation) return null;
  return { owner: role.participation !== 'observer', atDoors: comesAtDoors(role) };
}

/** A failed read is tried once more after this long before it is reported. */
export const ARRIVAL_RETRY_MS = 1500;

export interface MyArrivalRead {
  /** undefined while reading; null for nothing to read, no answers, or a failed read (see `failed`). */
  arrival: MyArrival | null | undefined;
  /** The read failed twice: the answers are unknown, which is not the same as "no answers". */
  failed: boolean;
  retry: () => void;
}

export function useMyRegistrationArrivalRead(
  event: { id: string; flow?: string | null; seriesSlug?: string | null; hikeRegistration?: string | null } | null | undefined,
  viewerId: string | null | undefined,
  enabled = true,
  /** R19: a hike's `event` answer is read as "at the meeting point" (only calendar and confirmation-line consumers ask; the prep plan does not). */
  includeHike = false,
): MyArrivalRead {
  const eventId = event?.id ?? null;
  const registration = event ? recipeForEvent(event).registration : undefined;
  // Any hike is read (not only one whose CURRENT preset asks): a host may switch the preset after people answered "at the meeting
  // point", and their calendar must still start at the arrival. Callers pass `enabled` only for someone who can have an answers row.
  const hike = includeHike && registration === 'hike';
  const asks = registration === 'mastermind' || hike; // `hike` is already false for any other flow
  const key = eventId && viewerId && asks && enabled ? `${eventId}:${viewerId}` : null;
  const [read, setRead] = useState<{ key: string; arrival: MyArrival | null; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key || !eventId || !viewerId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelWait: () => void = () => undefined;
    const ok = (role: Awaited<ReturnType<typeof getMyRegistrationRole>>) => { if (!cancelled) setRead({ key, arrival: arrivalOf(role), failed: false }); };
    const okHike = (when: Awaited<ReturnType<typeof getMyHikeWhen>>) => { if (!cancelled) setRead({ key, arrival: when ? { owner: true, atDoors: when === 'event' } : null, failed: false }); };
    const readOnce = () => (hike ? getMyHikeWhen(eventId, viewerId).then(okHike) : getMyRegistrationRole(eventId, viewerId).then(ok));
    const fail = () => { if (!cancelled) setRead({ key, arrival: null, failed: true }); };
    setRead(prev => (prev?.key === key && prev.failed ? null : prev)); // a Retry shows "reading" again
    // Metered rules 3 and 4: no request from a hidden tab (the first read and the retry wait until the tab is seen), and the retry is jittered.
    cancelWait = whenVisible(() => {
      readOnce().catch(() => {
        if (cancelled) return;
        timer = setTimeout(() => {
          cancelWait = whenVisible(() => { readOnce().catch(fail); });
        }, ARRIVAL_RETRY_MS * (0.75 + Math.random() * 0.5));
      });
    });
    return () => { cancelled = true; cancelWait(); if (timer) clearTimeout(timer); };
  }, [key, eventId, viewerId, attempt, hike]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  // undefined = still reading; null = nothing to read (another flow, signed out) or no answers.
  if (!key) return { arrival: null, failed: false, retry };
  if (read?.key !== key) return { arrival: undefined, failed: false, retry };
  return { arrival: read.arrival, failed: read.failed, retry };
}

/**
 * The arrival alone, for screens that only colour a calendar invite. A failed read counts as null for a mastermind; for a hike it
 * stays undefined (as while reading), so the surfaces keep hiding the calendar link rather than show one 15 minutes late.
 */
export function useMyRegistrationArrival(
  event: { id: string; flow?: string | null; seriesSlug?: string | null; hikeRegistration?: string | null } | null | undefined,
  viewerId: string | null | undefined,
  enabled = true,
  /** The session is still being restored, so the viewer is not known yet: for a hike that is "still reading" (undefined), not "no answers". */
  viewerPending = false,
): MyArrival | null | undefined {
  const { arrival, failed } = useMyRegistrationArrivalRead(event, viewerId, enabled, true);
  if ((failed || (viewerPending && !viewerId)) && event && recipeForEvent(event).registration === 'hike') return undefined;
  return arrival;
}
