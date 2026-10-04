/**
 * @file use-prep-state.ts
 * @description P1336 — one read of everything the preparation needs for (event, viewer): the
 * registration's prep row, the person's once-per-person parts, the cmp7 and event-tag points
 * (the same read StakePage makes, so the counts match the cards) and the public social proof.
 * The confirmation block, the flow page and the room banner all derive from it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { pointsService } from '@/app/data/points-service';
import { STANDARD_STAKE_TAGS } from '@/app/data/event-links';
import {
  getMyPreparation,
  getMyPrepParts,
  getPrepSocialProof,
  type EventPreparation,
  type PrepPartRow,
  type PrepSocialProof,
} from '@/app/data/event-prep-service';
import type { EventWithHost, PointWithUserPosition } from '@/app/types';
import {
  buildPlan,
  CMP7_TAG,
  isNewPerson,
  minutesFor,
  progressOf,
  remainingSteps,
  showsPrincipleIntro,
  type CardCounts,
  type PlanStep,
  type Progress,
} from './prep-plan';
import { syncLocalPrepParts } from './prep-local-parts';

/** StakePage's page size and fetch arguments, so "N points" equals the cards it shows. */
const TAG_POINTS_LIMIT = 50;
export function loadTagPoints(tag: string, viewerId: string | undefined): Promise<PointWithUserPosition[]> {
  const keepsUnstaked = (STANDARD_STAKE_TAGS as readonly string[]).includes(tag);
  return pointsService.getPublicPointsFeed(TAG_POINTS_LIMIT, 0, tag, viewerId, true, keepsUnstaked, true);
}

export const isAnswered = (p: PointWithUserPosition) => !!p.userPosition;

export interface PrepState {
  loading: boolean;
  /** The prep read failed — callers must not show "not started" for an unknown state. */
  error: boolean;
  prep: EventPreparation | null;
  parts: PrepPartRow[];
  cmp7Points: PointWithUserPosition[] | null;
  eventPoints: PointWithUserPosition[] | null;
  proof: PrepSocialProof | null;
  plan: PlanStep[];
  progress: Progress;
  withPrincipleIntro: boolean;
  /** Cards still to answer, per step (all cards for a new person: the promise never shrinks). */
  cards: CardCounts;
  /** "Do you have N minutes": the rows still to do; null until the points have loaded. */
  minutes: number | null;
  reload: () => Promise<void>;
  setPrep: (prep: EventPreparation) => void;
  setParts: (parts: PrepPartRow[]) => void;
  reloadPoints: () => void;
}

export function usePrepState(event: EventWithHost | null, viewerId: string | undefined): PrepState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [prep, setPrep] = useState<EventPreparation | null>(null);
  const [parts, setParts] = useState<PrepPartRow[]>([]);
  const [cmp7Points, setCmp7Points] = useState<PointWithUserPosition[] | null>(null);
  const [eventPoints, setEventPoints] = useState<PointWithUserPosition[] | null>(null);
  const [proof, setProof] = useState<PrepSocialProof | null>(null);

  const eventId = event?.id;
  const tag = event?.statementTag;
  const enabled = !!event?.preparationEnabled;

  const reload = useCallback(async () => {
    if (!eventId || !viewerId || !enabled) {
      setLoading(false);
      return;
    }
    // A read for a new (event, viewer) is "unknown" until it lands — never "not started".
    setLoading(true);
    try {
      const [p, accountParts] = await Promise.all([getMyPreparation(eventId, viewerId), getMyPrepParts(viewerId)]);
      let pr = accountParts;
      // P1402: parts done signed-out on /prepare join the account before the plan is built, so
      // they are not asked again here.
      if ((await syncLocalPrepParts(viewerId, pr, p?.startedAt ?? null)).length > 0) pr = await getMyPrepParts(viewerId);
      setPrep(p);
      setParts(pr);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [eventId, viewerId, enabled]);

  const reloadPoints = useCallback(() => {
    if (!viewerId || !enabled) return;
    // A failed read stays null ("unknown"), never [] — an empty list would pass the step over
    // as "nothing left to answer" and record the once-per-person part as completed.
    loadTagPoints(CMP7_TAG, viewerId).then(setCmp7Points).catch(() => undefined);
    if (tag) loadTagPoints(tag, viewerId).then(setEventPoints).catch(() => undefined);
    else setEventPoints([]);
  }, [viewerId, enabled, tag]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { reloadPoints(); }, [reloadPoints]);
  useEffect(() => {
    if (!eventId || !enabled) return;
    getPrepSocialProof(eventId).then(setProof);
  }, [eventId, enabled]);

  const derived = useMemo(() => {
    const startedAt = prep?.startedAt ?? null;
    const plan = buildPlan({
      parts,
      startedAt,
      hasStatementTag: !!tag,
      eventPointCount: eventPoints ? eventPoints.length : null,
    });
    const progress = progressOf(plan, prep?.stepsDone ?? [], prep?.completedAt ?? null);
    const withPrincipleIntro = showsPrincipleIntro(parts, startedAt);
    const full = isNewPerson(parts) && !startedAt;
    const count = (pts: PointWithUserPosition[] | null) => (pts ?? []).filter((p) => full || !isAnswered(p)).length;
    const cards: CardCounts = { cmp7: count(cmp7Points), stake: count(eventPoints) };
    const pointsReady = cmp7Points !== null && eventPoints !== null;
    const minutes = pointsReady
      ? minutesFor(remainingSteps(plan, prep?.stepsDone ?? []), cards, withPrincipleIntro)
      : null;
    return { plan, progress, withPrincipleIntro, cards, minutes };
  }, [parts, prep, tag, eventPoints, cmp7Points]);

  return {
    loading,
    error,
    prep,
    parts,
    cmp7Points,
    eventPoints,
    proof,
    ...derived,
    reload,
    setPrep,
    setParts,
    reloadPoints,
  };
}
