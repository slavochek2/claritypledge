/**
 * @file use-prep-state.ts
 * @description P1336 — one read of everything the preparation needs for (event, viewer): the
 * registration's prep row, the person's once-per-person parts, the cmp7 and event-tag points
 * (the same read StakePage makes, so the counts match the cards) and the public social proof.
 * The confirmation block, the flow page and the room banner all derive from it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pointsService } from '@/app/data/points-service';
import { STANDARD_STAKE_TAGS } from '@/app/data/event-links';
import {
  getMyPreparation,
  getMyPrepParts,
  getPrepSocialProof,
  type EventPreparation,
  type PrepPartRow,
  type PrepStepKey,
  type PrepSocialProof,
} from '@/app/data/event-prep-service';
import type { EventWithHost, PointWithUserPosition } from '@/app/types';
import {
  buildPlan,
  finishedSteps,
  hasLearned,
  isAnswered,
  CMP7_TAG,
  isNewPerson,
  preparationMinutes,
  progressOf,
  showsPrincipleIntro,
  type CardCounts,
  type PlanStep,
  type Progress,
} from './prep-plan';
import { syncLocalPrepParts } from './prep-local-parts';
import { shareInFlight } from '@/lib/share-in-flight';
import { whenVisible } from '../when-visible';
import { offersPreparation, recipeForEvent } from '../series-recipes';
import { useMyRegistrationArrivalRead, type MyArrival } from '../use-my-arrival';
import { planTotalMinutes, planTotalOnly } from './prep-resume';
import { canvasAtEvent, prepareStepsFor, prepStatementTag } from './prep-timing';
import { OBSERVER_PREP_MINUTES, OWNER_PREP_MINUTES, PREP_MINUTES } from '../components/registration-copy';

/** StakePage's page size and fetch arguments, so "N points" equals the cards it shows. */
const TAG_POINTS_LIMIT = 50;
export function loadTagPoints(tag: string, viewerId: string | undefined): Promise<PointWithUserPosition[]> {
  const keepsUnstaked = (STANDARD_STAKE_TAGS as readonly string[]).includes(tag);
  // Round 9 (speed): the screens that mount several learning-state readers share one read.
  return shareInFlight(`tag-points:${tag}:${viewerId ?? ''}`, () => pointsService.getPublicPointsFeed(TAG_POINTS_LIMIT, 0, tag, viewerId, true, keepsUnstaked, true));
}

export { isAnswered } from './prep-plan';

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
  /** The plan's finished steps: this registration's, plus parts finished elsewhere where the recipe keeps them (A). */
  stepsDone: PrepStepKey[];
  progress: Progress;
  withPrincipleIntro: boolean;
  /** Cards still to answer, per step (all cards for a new person: the promise never shrinks). */
  cards: CardCounts;
  /** "Do you have N minutes": the rows still to do; null until the points have loaded. In the mastermind, before anything is done,
   *  the role's own time (OWNER_PREP_MINUTES / OBSERVER_PREP_MINUTES), null until the role is known, and null once started. */
  minutes: number | null;
  /** The mastermind's plan shows one total and no row minutes: its total is the role's own time, not the rows' sum. */
  totalOnly: boolean;
  /** P1675 R13: nothing of the learning is done here or anywhere else (the plan page's "About 15 minutes." case). */
  brandNew: boolean;
  /** P1529: the person's role and arrival in a flow that asks; null elsewhere and until it is read. */
  arrival: MyArrival | null;
  /** The registration read failed twice: the plan is empty (never derived from it) and the page offers Retry. */
  arrivalError: boolean;
  retryArrival: () => void;
  /** P1542 round 5: the person has done the learning here or anywhere else (hasLearned). */
  learned: boolean;
  reload: () => Promise<void>;
  setPrep: (prep: EventPreparation) => void;
  setParts: (parts: PrepPartRow[]) => void;
  reloadPoints: () => void;
}

/** P1542 round 10f: a value tagged with the inputs it was read for — shown only while those are still the inputs. */
type Scoped<T> = { key: string; value: T } | null;
const scoped = <T,>(s: Scoped<T>, key: string, fallback: T): T => (s && s.key === key ? s.value : fallback);

export function usePrepState(event: EventWithHost | null, viewerId: string | undefined): PrepState {
  const [loading, setLoading] = useState(true);
  const eventId = event?.id;
  const tag = prepStatementTag(event) ?? undefined; // P1529 E2: the mastermind with its canvas at the event reads the misunderstanding points
  // P1542: required by the flag, or optional by the series' recipe (hikes).
  const enabled = offersPreparation(event);

  // P1542 round 10b/10d/10f: every value here is tagged with the inputs it was read for (event, viewer, enabled — and
  // the statement tag for the points), and is shown only while those are still the inputs. On a change of viewer,
  // event or tag nothing of the previous inputs is ever handed out — not while the new read is out, not when it stalls,
  // not when it fails. `loading` stays true until a read for exactly these inputs has finished, and a request-id fence
  // lets only the LATEST read set anything (a late answer for earlier inputs is dropped).
  const inputKey = `${eventId ?? ''}:${viewerId ?? ''}:${enabled ? 1 : 0}`;
  const pointsKey = `${viewerId ?? ''}:${enabled ? 1 : 0}:${tag ?? ''}`;
  const idle = !eventId || !viewerId || !enabled;
  const [prepS, setPrepS] = useState<Scoped<EventPreparation | null>>(null);
  const [partsS, setPartsS] = useState<Scoped<PrepPartRow[]>>(null);
  const [errorS, setErrorS] = useState<Scoped<boolean>>(null);
  const [cmp7S, setCmp7S] = useState<Scoped<PointWithUserPosition[] | null>>(null);
  const [eventPointsS, setEventPointsS] = useState<Scoped<PointWithUserPosition[] | null>>(null);
  const [proofS, setProofS] = useState<Scoped<PrepSocialProof | null>>(null);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  const requestRef = useRef(0);
  const reload = useCallback(async () => {
    const key = `${eventId ?? ''}:${viewerId ?? ''}:${enabled ? 1 : 0}`;
    const request = ++requestRef.current;
    const latest = () => request === requestRef.current;
    if (!eventId || !viewerId || !enabled) {
      setLoading(false);
      setAnsweredKey(key);
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
      if (!latest()) return;
      setPrepS({ key, value: p });
      setPartsS({ key, value: pr });
      setErrorS({ key, value: false });
    } catch {
      if (latest()) setErrorS({ key, value: true });
    } finally {
      if (latest()) {
        setLoading(false);
        setAnsweredKey(key);
      }
    }
  }, [eventId, viewerId, enabled]);

  // Round 10e/10f: the points reads are fenced the same way — only the latest call's answers land, under its key.
  const pointsRequestRef = useRef(0);
  const reloadPoints = useCallback(() => {
    const request = ++pointsRequestRef.current;
    if (!viewerId || !enabled) return;
    const key = `${viewerId}:1:${tag ?? ''}`;
    const latest = () => request === pointsRequestRef.current;
    // A failed read stays null ("unknown"), never [] — an empty list would pass the step over
    // as "nothing left to answer" and record the once-per-person part as completed.
    loadTagPoints(CMP7_TAG, viewerId).then((p) => { if (latest()) setCmp7S({ key, value: p }); }).catch(() => undefined);
    if (tag) loadTagPoints(tag, viewerId).then((p) => { if (latest()) setEventPointsS({ key, value: p }); }).catch(() => undefined);
    else setEventPointsS({ key, value: [] });
  }, [viewerId, enabled, tag]);

  // Round 10g (metered-services rule 3: a hidden tab makes no requests): the reads a mount starts wait until the tab is
  // seen, and a wait is cancelled on unmount or when the inputs change. Disabled inputs settle at once (no request).
  // A reload the page asks for itself (after a save, a user action in a visible tab) still runs at once.
  useEffect(() => {
    if (idle) { void reload(); return; }
    return whenVisible(() => { void reload(); });
  }, [reload, idle]);
  useEffect(() => {
    if (idle) { reloadPoints(); return; }
    return whenVisible(() => { reloadPoints(); });
  }, [reloadPoints, idle]);
  // Round 10f: the public social proof, only for a viewer who is reading the preparation (never for a page that turned
  // the reads off — the hike thank-you sends none), fenced to its event; round 10g: once the tab is seen.
  useEffect(() => {
    if (!eventId || !enabled || !viewerId) return;
    let cancelled = false;
    const cancelWait = whenVisible(() => {
      getPrepSocialProof(eventId).then((value) => { if (!cancelled) setProofS({ key: eventId, value }); });
    });
    return () => { cancelled = true; cancelWait(); };
  }, [eventId, enabled, viewerId]);

  const prep = idle ? null : scoped(prepS, inputKey, null);
  const partsRaw = idle ? null : scoped<PrepPartRow[] | null>(partsS, inputKey, null);
  const parts = useMemo(() => partsRaw ?? [], [partsRaw]);
  const error = idle ? false : scoped(errorS, inputKey, false);
  const cmp7Points = idle ? null : scoped(cmp7S, pointsKey, null);
  const eventPoints = idle ? null : scoped(eventPointsS, pointsKey, null);
  const proof = idle || !eventId ? null : scoped(proofS, eventId, null);
  const setPrep = useCallback((value: EventPreparation) => setPrepS({ key: inputKey, value }), [inputKey]);
  const setParts = useCallback((value: PrepPartRow[]) => setPartsS({ key: inputKey, value }), [inputKey]);

  const { arrival, failed: arrivalError, retry: retryArrival } = useMyRegistrationArrivalRead(event, viewerId, !idle);
  const derived = useMemo(() => {
    const startedAt = prep?.startedAt ?? null;
    const { keepFinished } = recipeForEvent(event).prepare;
    const steps = prepareStepsFor(event);
    const mastermind = !!recipeForEvent(event).mastermind;
    // A failed arrival read leaves the owner's canvas step unknown: no plan is derived from it (the page shows Retry).
    const plan = arrivalError ? [] : buildPlan({
      parts,
      startedAt,
      hasStatementTag: !!tag,
      eventPointCount: eventPoints ? eventPoints.length : null,
      steps,
      keepFinished: !!keepFinished,
      canvas: !!arrival?.owner, // owners only: an observer's preparation has no canvas step
    });
    const stepsDone = keepFinished ? finishedSteps(plan, prep?.stepsDone ?? [], parts) : prep?.stepsDone ?? [];
    const progress = progressOf(plan, stepsDone, prep?.completedAt ?? null);
    const withPrincipleIntro = showsPrincipleIntro(parts, startedAt);
    const full = isNewPerson(parts) && !startedAt;
    const count = (pts: PointWithUserPosition[] | null) => (pts ?? []).filter((p) => full || !isAnswered(p)).length;
    const cards: CardCounts = { cmp7: count(cmp7Points), stake: count(eventPoints) };
    const pointsReady = cmp7Points !== null && eventPoints !== null;
    const computed = pointsReady
      ? preparationMinutes(plan, stepsDone, cards, withPrincipleIntro)
      : null;
    // The mastermind says the real time by role before anything is done (founder, 2026-11-06); the role is unknown until read.
    const untouched = !startedAt && stepsDone.length === 0;
    // Sales mastermind, one rule: before starting, one total for the role and no row minutes; once started, neither (founder, 2026-11-09).
    const statedMinutes = recipeForEvent(event).prepare.statedMinutes;
    // A series with a stated length shows min(computed remaining, stated): never above it, only shrinking. Mastermind: `untouched`.
    // A brand-new person (nothing learned anywhere, no step of this event done) is told the stated length itself.
    const brandNew = isNewPerson(parts) && progress.done === 0;
    const minutes = planTotalMinutes({ mastermind, untouched, roleMinutes: arrival ? (canvasAtEvent(event) ? PREP_MINUTES : arrival.owner ? OWNER_PREP_MINUTES : OBSERVER_PREP_MINUTES) : null, computed, statedMinutes, brandNew });
    // When the stated number is the one shown, the rows' computed minutes (which would not sum to it) are hidden with it.
    const totalOnly = planTotalOnly({ mastermind, computed, statedMinutes, brandNew });
    return { plan, stepsDone, progress, withPrincipleIntro, cards, minutes, totalOnly, brandNew, learned: hasLearned(parts, prep?.completedAt) };
  }, [parts, prep, tag, eventPoints, cmp7Points, event?.seriesSlug, event?.flow, event?.canvasTiming, arrival, arrivalError]);

  // Disabled inputs (no event, no viewer, preparation off) answer "idle" on the same render — never one extra
  // "loading" render; otherwise loading until the read for exactly these inputs has finished.
  const isLoading = idle ? false : loading || answeredKey !== inputKey || arrival === undefined;
  return {
    loading: isLoading,
    error,
    prep,
    parts,
    cmp7Points,
    eventPoints,
    proof,
    arrival: arrival ?? null,
    arrivalError,
    retryArrival,
    ...derived,
    // No number before the read is in: the stated value must not show for a returning person whose progress has not loaded.
    minutes: isLoading ? null : derived.minutes,
    reload,
    setPrep,
    setParts,
    reloadPoints,
  };
}
