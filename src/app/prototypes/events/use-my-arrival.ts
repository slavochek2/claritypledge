/**
 * @file use-my-arrival.ts
 * @description P1529 UAT round 1: the person's own role and arrival time in a flow that asks. An owner makes a canvas (15 minutes of
 * preparation), an observer prepares (7); someone who chose to prepare at the event comes at the doors time, everyone else at the
 * start. `undefined` while the read is out; `null` for any event or person without answers.
 */
import { useEffect, useState } from 'react';
import { getMyRegistrationRole } from '@/app/data/my-registration-answers';
import { comesAtDoors } from '@/app/data/registration-answer-model';
import { recipeForEvent } from './series-recipes';

export interface MyArrival {
  owner: boolean;
  atDoors: boolean;
}

/** Pure: the arrival from the answers. */
export function arrivalOf(role: { participation: string | null; observerPrep: string | null } | null): MyArrival | null {
  if (!role?.participation) return null;
  return { owner: role.participation !== 'observer', atDoors: comesAtDoors(role) };
}

export function useMyRegistrationArrival(
  event: { id: string; flow?: string | null; seriesSlug?: string | null } | null | undefined,
  viewerId: string | null | undefined,
  enabled = true,
): MyArrival | null | undefined {
  const eventId = event?.id ?? null;
  const asks = !!event && !!recipeForEvent(event).registrationQuestions;
  const key = eventId && viewerId && asks && enabled ? `${eventId}:${viewerId}` : null;
  const [read, setRead] = useState<{ key: string; arrival: MyArrival | null } | null>(null);
  useEffect(() => {
    if (!key || !eventId || !viewerId) return;
    let cancelled = false;
    getMyRegistrationRole(eventId, viewerId)
      .then(role => { if (!cancelled) setRead({ key, arrival: arrivalOf(role) }); })
      .catch(() => { if (!cancelled) setRead({ key, arrival: null }); });
    return () => { cancelled = true; };
  }, [key, eventId, viewerId]);
  // undefined = still reading; null = nothing to read (another flow, signed out) or no answers.
  if (!key) return null;
  return read?.key === key ? read.arrival : undefined;
}
