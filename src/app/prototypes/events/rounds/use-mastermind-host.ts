/**
 * @file use-mastermind-host.ts
 * @description P1529 §1, §3, §4, §7: what the host screen and the projector read for the sales mastermind, apart from
 * the Clarity Night page: the event's flow (a switch is followed without a reload), the per-person host state
 * (canvas, observer, phone, recording), the seating plan and its check, and the ready mark. The host has no canvas-update step: each owner updates from their own round card.
 *
 * Nothing here runs for another flow: every read starts only while the mastermind is the flow, so Clarity Night and
 * Social Hike make no new calls.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getEveningEnd,
  getMastermindHostState,
  getPreviousSessionPartners,
  hostSetObserver,
  isCanvasHolder,
  recordingState,
  type MastermindPerson,
  type RecordingState,
} from '@/app/data/event-mastermind-service';
import { hostEndRound, hostEndRounds, seatKeys, type EventRound, type RoundSeat } from '@/app/data/event-rounds-service';
import { planMastermindRound, type MastermindSeatingPlan } from '@/lib/mastermind-seating';
import { checkMastermindSeats, type SeatingProblem } from '@/lib/mastermind-seating-check';
import { countedRounds } from '@/lib/round-numbering';
import { startVisiblePoll } from '@/lib/visible-poll';
import type { Seat } from '@/lib/round-grouping';
import type { EventRoomMember } from '@/app/types';
import { eventFlow, type EventFlow, type FlowEvent } from '../series-recipes';
import { isUnregistered, PLAN_NOT_READY } from './mastermind-host-helpers';
import { GAP_POLL_MS, eveningEndedAfter } from './mastermind-round-helpers';

/** Anything a person is waiting for shows within about 4 seconds (spec Cost Budget): the host screen re-reads this often, on a visible tab only. */
export const HOST_STATE_POLL_MS = 4_000;

const visibleNow = () => document.visibilityState !== 'hidden';

/** The event's effective flow. A switch the host just made applies at once; a reload reads the stored one. */
export function useHostFlow(event: (FlowEvent & { id: string }) | null): { flow: EventFlow; choose: (flow: EventFlow) => void } {
  const [picked, setPicked] = useState<{ eventId: string; flow: EventFlow } | null>(null);
  const eventId = event?.id;
  const flow = picked && picked.eventId === eventId ? picked.flow : eventFlow(event);
  const choose = useCallback((next: EventFlow) => setPicked(eventId ? { eventId, flow: next } : null), [eventId]);
  return { flow, choose };
}

export type ObserverResult = { ok: true } | { ok: false; code: string };

export interface MastermindHost {
  active: boolean;
  /** The per-person state has been read at least once. */
  ready: boolean;
  /** A read failed and what is shown may be old; null when all is well. */
  warning: string | null;
  /** Reads the per-person state again now (the waiting list's Retry). */
  refresh: () => Promise<void>;
  /** The previous session's partners could not be read: the plan runs without that rule, and the read is retried. */
  previousFailed: boolean;
  personOf: (memberId: string) => MastermindPerson | undefined;
  /** Everyone the host state names (registered or in the room), for counts that include people not in the room yet. */
  people: MastermindPerson[];
  recordingOf: (memberId: string) => RecordingState;
  /** A canvas is shared and the person was never an owner or partner in a counted round (D17). Only after round 1 starts. */
  isReady: (memberId: string) => boolean;
  setObserver: (memberId: string, isObserver: boolean) => Promise<ObserverResult>;
  plan: (roundNo: number, poolIds: string[], shuffle: number) => MastermindSeatingPlan;
  check: (seats: Seat[], roundNo: number, poolIds: string[]) => SeatingProblem[];
  /** Why a round cannot be proposed at all (nobody can own a table yet), or null. */
  guardOpen: () => string | null;
  /** People with a canvas shared who are not marked observer. */
  canvasCount: number;
  /** The host's "End the evening" stamp is at or after the newest round's start. A round ended with no stamp is "between rounds". */
  eveningOver: boolean;
  /** Ends the newest round only ("End round N"). */
  endRound: () => Promise<void>;
  /** Ends the evening and reads the stamp at once (a phone between rounds waits on it). */
  endEvening: () => Promise<void>;
}

interface Args {
  eventId: string | undefined;
  /** The event's flow is the mastermind. */
  active: boolean;
  /** The projector. */
  screen: boolean;
  rounds: EventRound[];
  seatsByRound: Map<string, RoundSeat[]>;
  /** The people who can be seated (the host is not one). */
  members: EventRoomMember[];
  /** Reads the rounds now: the host's own taps wait for it, so the screen never shows the state before the tap. */
  refreshRounds?: () => Promise<void>;
}

export function useMastermindHost({ eventId, active, screen, rounds, seatsByRound, members, refreshRounds }: Args): MastermindHost {
  const [hostState, setHostState] = useState<Map<string, MastermindPerson> | null>(null);
  const [readAt, setReadAt] = useState(0);
  const [previous, setPrevious] = useState<[string, string][] | null>(null);
  const [previousFailed, setPreviousFailed] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const host = active && !!eventId;

  const refreshState = useCallback(async () => {
    if (!eventId) return;
    try {
      setHostState(await getMastermindHostState(eventId));
      setReadAt(Date.now());
      setWarning(null);
    } catch {
      setWarning('Could not read the room just now. What is shown may be out of date.');
    }
  }, [eventId]);

  useEffect(() => {
    if (!host || screen) return;
    // Metered services rule 3: a hidden tab makes no request, and reads once when it is shown again.
    if (visibleNow()) void refreshState();
    return startVisiblePoll(() => void refreshState(), HOST_STATE_POLL_MS);
  }, [host, screen, refreshState]);

  // The session this one continues: read until it answers. A failed read plans without that rule, says so, and tries again.
  useEffect(() => {
    if (!host || screen || !eventId) return;
    let cancelled = false;
    let stop = () => {};
    const read = () => getPreviousSessionPartners(eventId)
      .then(pairs => { if (cancelled) return; setPrevious(pairs); setPreviousFailed(false); stop(); })
      .catch(() => { if (!cancelled) { setPrevious(p => p ?? []); setPreviousFailed(true); } });
    if (visibleNow()) void read();
    stop = startVisiblePoll(() => void read(), HOST_STATE_POLL_MS);
    return () => { cancelled = true; stop(); };
  }, [host, screen, eventId]);

  const counted = countedRounds(rounds);
  const lastRound = rounds[rounds.length - 1];
  const [eveningEnd, setEveningEnd] = useState<string | null>(null);
  const readEvening = useCallback(async () => {
    if (!eventId) return;
    try { setEveningEnd(await getEveningEnd(eventId)); } catch { /* keep what is shown */ }
  }, [eventId]);
  // The host's stamp: the evening is over when it is at or after the newest round's start.
  const eveningOver = eveningEndedAfter(eveningEnd, rounds);

  // Whether the host ended the evening: read only in the gap (newest round ended) and only until it is over, on the host's screen and
  // the projector alike: once over, nothing polls. A running round needs no read: ending the evening ends it, and the gap that follows reads.
  const watchEvening = host && !!lastRound?.endedAt && !eveningOver;
  useEffect(() => {
    if (!watchEvening) return;
    if (visibleNow()) void readEvening();
    return startVisiblePoll(() => void readEvening(), GAP_POLL_MS);
  }, [watchEvening, readEvening]);
  const byMember = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const personOf = useCallback(
    (memberId: string) => {
      const profileId = byMember.get(memberId)?.profileId;
      return profileId ? hostState?.get(profileId) : undefined;
    },
    [byMember, hostState],
  );
  const recordingOf = useCallback((memberId: string) => recordingState(personOf(memberId), readAt), [personOf, readAt]);

  const everSeated = useMemo(() => {
    const out = new Set<string>();
    for (const r of rounds) if (!r.showcase) for (const s of seatsByRound.get(r.id) ?? []) if (s.role !== 'observer') out.add(s.id);
    return out;
  }, [rounds, seatsByRound]);
  const isReady = useCallback(
    (memberId: string) => {
      const p = personOf(memberId);
      return counted >= 1 && !!p?.canvasShared && p.observerOverride !== true && !everSeated.has(memberId);
    },
    [personOf, counted, everSeated],
  );

  /** What the planner is given: holders and observers from the pool, history from counted rounds only. */
  const inputsFor = useCallback(
    (roundNo: number, poolIds: string[]) => {
      // D24: the server seats nobody without a registration, so the plan never proposes them (the people list says why).
      const seatable = poolIds.filter(id => !isUnregistered(personOf(id)));
      const holders = seatable.filter(id => isCanvasHolder(personOf(id)));
      const observers = seatable.filter(id => !isCanvasHolder(personOf(id)));
      const history = rounds.filter(r => !r.showcase && r.roundNo < roundNo).map(r => (seatsByRound.get(r.id) ?? []) as Seat[]);
      const memberOf = new Map<string, string>();
      for (const m of members) if (m.profileId) memberOf.set(m.profileId, m.id);
      const previousPartners = (previous ?? []).flatMap(([a, b]): [string, string][] => {
        const x = memberOf.get(a);
        const y = memberOf.get(b);
        return x && y ? [[x, y]] : [];
      });
      return { holders, observers, history, previousPartners };
    },
    [personOf, rounds, seatsByRound, members, previous],
  );

  const cache = useRef(new Map<string, MastermindSeatingPlan>());
  const plan = useCallback(
    (roundNo: number, poolIds: string[], shuffle: number) => {
      const inputs = inputsFor(roundNo, poolIds);
      const cacheKey = JSON.stringify([shuffle, inputs.holders, inputs.observers, inputs.history.map(s => seatKeys(s)), inputs.previousPartners]);
      const hit = cache.current.get(cacheKey);
      if (hit) return hit;
      // The seed is the event and the shuffle count: the same room and Shuffle give the same tables back.
      const made = planMastermindRound({ ...inputs, seed: `${eventId ?? ''}:mastermind:${shuffle}` });
      if (cache.current.size > 40) cache.current.clear();
      cache.current.set(cacheKey, made);
      return made;
    },
    [inputsFor, eventId],
  );
  const check = useCallback(
    (seats: Seat[], roundNo: number, poolIds: string[]) => {
      const { holders, observers, history, previousPartners } = inputsFor(roundNo, poolIds);
      return checkMastermindSeats(seats, { holders, observers, history, previousPartners });
    },
    [inputsFor],
  );
  const guardOpen = useCallback(
    () => {
      if (!active) return null;
      // Seat anyway: nothing but "not read yet" stops the host (fewer than two people is stopped by the caller).
      return !hostState || previous === null ? PLAN_NOT_READY : null;
    },
    [active, hostState, previous],
  );

  const setObserver = useCallback(
    async (memberId: string, isObserver: boolean): Promise<ObserverResult> => {
      const profileId = byMember.get(memberId)?.profileId;
      if (!eventId || !profileId) return { ok: false, code: 'no_profile' };
      try {
        const res = await hostSetObserver(eventId, profileId, isObserver);
        await refreshState();
        return res.status === 'ok' ? { ok: true } : { ok: false, code: res.code ?? 'refused' };
      } catch {
        return { ok: false, code: 'error' };
      }
    },
    [eventId, byMember, refreshState],
  );

  // The tap's own result is read before the host's button comes back (the rounds, then the gap reads start on their own).
  const endRound = useCallback(async () => {
    if (!eventId) return;
    await hostEndRound(eventId);
    await refreshRounds?.();
  }, [eventId, refreshRounds]);

  const endEvening = useCallback(async () => {
    if (!eventId) return;
    await hostEndRounds(eventId);
    await readEvening();
    await refreshRounds?.();
  }, [eventId, readEvening, refreshRounds]);

  const people = useMemo(() => [...(hostState?.values() ?? [])], [hostState]);
  /** How many people have a canvas shared and are not marked observer: under two, the host's button says "Seat tables anyway". */
  const canvasCount = useMemo(() => people.filter(p => isCanvasHolder(p)).length, [people]);

  return {
    active, ready: !!hostState && previous !== null, warning, refresh: refreshState, previousFailed, personOf, people, recordingOf, isReady, setObserver, plan, check, guardOpen,
    eveningOver, endRound, endEvening, canvasCount,
  };
}
