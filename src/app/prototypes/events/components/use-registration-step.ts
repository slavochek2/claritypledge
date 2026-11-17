/**
 * @file use-registration-step.ts
 * @description P1529 D16, D24: the event page's registration step for a flow that asks before the seat, and the one place
 * that turns a registration's outcome into what the page shows. Other flows only use the outcome half.
 *
 * One `submit` serves every case: signed out it keeps the answers in this browser and goes to sign-up (nothing is sent);
 * signed in it registers, or joins the waiting list when the event is full. A place that went in the meantime is
 * "This event just filled up." with the answers kept, and the waiting list offered.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { registerForEvent } from '@/app/data/event-registration';
import { joinWaitlist } from '@/app/data/event-waitlist';
import { registerForHike } from '@/app/data/hike-registration';
import { DEFAULT_HIKE_ASKS, type HikeAnswers, type HikeAsks, type HikeWhen } from '@/app/data/hike-answer-model';
import { HIKE_NOW_ONLY_NOTICE } from './hike-copy';
import { clearRegistrationDraft, saveHikeDraft, saveRegistrationDraft } from '@/app/data/registration-draft';
import type { RegistrationAnswers } from '@/app/data/registration-answer-model';
import { isSessionMismatch } from '@/lib/session-guard';
import { useWaitlistState } from './use-waitlist-state';

export type RsvpRefusal = 'full' | 'cancelled' | null;

export function refusalMessage(refusal: 'full' | 'cancelled'): string {
  return refusal === 'full' ? 'This event is full.' : 'This event has been cancelled.';
}

export function useRegistrationStep(opts: {
  event: { id: string; slug: string } | null | undefined;
  userId: string | undefined;
  onRegistered: () => void;
  onRefused: (refusal: 'full' | 'cancelled') => void;
  onSessionLost: () => void;
  /** P1700: the server refused with the removal messages; the page re-reads the removal status and shows its notice. */
  onClosed?: () => void;
  /** The event is full for this person: the same form joins the waiting list. */
  full?: boolean;
  /** A flow that asks, for someone without a place: read whether they are on the waiting list. Absent in every other flow. */
  readsWaitlist?: boolean;
  /** Signed out: the answers are kept and the person goes to the normal sign-up. */
  onSignIn?: () => void;
  /** P1675: a hike has a seat (new or already held); `when` is the person's answer, 'now' goes straight into the introduction. */
  onHikeRegistered?: (when: HikeWhen) => void;
  /** P1675 R6: which optional hike questions the event asks (both when absent). */
  hikeAsks?: HikeAsks;
}) {
  const hikeAsks = opts.hikeAsks ?? DEFAULT_HIKE_ASKS;
  const [asking, setAsking] = useState(false);
  const [hikePrefill, setHikePrefill] = useState<HikeAnswers | null>(null);
  const [nowOnly, setNowOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState(false);
  const [prefill, setPrefill] = useState<RegistrationAnswers | null>(null);
  const waitlist = useWaitlistState(opts.event, opts.userId, !!opts.readsWaitlist);
  const slug = opts.event?.slug;

  /** True when the answers went somewhere (a place, the list, sign-up) or the page now says why not; false when a retry is needed. */
  const submit = async (answers: RegistrationAnswers): Promise<boolean> => {
    if (!opts.event || !slug) return false;
    if (!opts.userId) {
      // Signed out. Kept only if the browser lets us; without it the form simply opens empty on the way back.
      saveRegistrationDraft(slug, opts.full ? 'waitlist' : 'register', answers);
      setAsking(false);
      opts.onSignIn?.();
      return true;
    }
    setBusy(true);
    try {
      if (opts.full) {
        const listed = await joinWaitlist(slug, opts.userId, answers);
        if (listed === 'ok' || listed === 'already') {
          waitlist.setOnList(true);
          clearRegistrationDraft(slug);
          setAsking(false);
          return true;
        }
        if (listed === 'closed') { setAsking(false); opts.onClosed?.(); return true; }
        if (listed === 'cancelled') { setAsking(false); opts.onRefused('cancelled'); return true; }
        if (listed !== 'not_full' && listed !== 'registered') { toast.error("Couldn't join the waiting list. Please try again."); return false; }
        // 'not_full' or 'registered': a place is free after all, so register below
      }
      const result = await registerForEvent(opts.event, opts.userId, answers);
      if (result === 'ok' || result === 'already') {
        clearRegistrationDraft(slug);
        setAsking(false);
        opts.onRegistered();
        return true;
      } else if (result === 'full') {
        // The answers stay (the form keeps them; a saved draft stays too). The page offers the waiting list.
        setFilled(true);
        setAsking(false);
        opts.onRefused('full');
        return true;
      } else if (result === 'closed') {
        setAsking(false);
        opts.onClosed?.();
        return true;
      } else if (result === 'cancelled') {
        setAsking(false);
        opts.onRefused('cancelled');
        return true;
      }
      toast.error("Couldn't register you. Please try again.");
      return false;
    } catch (err) {
      // A lost session signs in again; anything else keeps the step open with the answers and says to try again.
      if (isSessionMismatch(err)) { opts.onSessionLost(); return true; }
      toast.error("Couldn't register you. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** P1675: the hike's form. Same contract as `submit`: true when the answers went somewhere or the page says why not. */
  const submitHike = async (answers: HikeAnswers): Promise<boolean> => {
    if (!opts.event || !slug) return false;
    if (!opts.userId) {
      saveHikeDraft(slug, answers, hikeAsks);
      setAsking(false);
      opts.onSignIn?.();
      return true;
    }
    setBusy(true);
    try {
      const result = await registerForHike(opts.event, opts.userId, answers, hikeAsks);
      if (result === 'ok' || result === 'already') {
        clearRegistrationDraft(slug);
        setAsking(false);
        opts.onHikeRegistered?.(answers.when);
        return true;
      }
      if (result === 'now_only') {
        // The form opened before the cutoff and was sent after it: it reopens with only "now", every other answer kept.
        // "later" is kept so the form clears it (later is no longer offered): the person picks "now" themselves.
        setHikePrefill(answers);
        setNowOnly(true);
        setAsking(true);
        toast(HIKE_NOW_ONLY_NOTICE);
        return true;
      }
      if (result === 'full' || result === 'cancelled') {
        setAsking(false);
        opts.onRefused(result);
        return true;
      }
      toast.error(result === 'not_found' ? "Couldn't find this hike." : "Couldn't register you. Please try again.");
      return false;
    } catch (err) {
      if (isSessionMismatch(err)) { opts.onSessionLost(); return true; }
      toast.error("Couldn't register you. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    submitHike,
    hikePrefill,
    nowOnly,
    keepHikeAnswers: (saved: HikeAnswers) => setHikePrefill(saved),
    askHike: (saved?: HikeAnswers | null) => { if (saved) setHikePrefill(saved); setAsking(true); },
    asking, busy, submit,
    /** Answers saved before sign-up, filling the form. */
    prefill: prefill ?? waitlist.entry,
    /** "This event just filled up." is showing: a place went while the person was registering or signing in. */
    filled,
    markFilled: () => setFilled(true),
    keepAnswers: (saved: RegistrationAnswers) => setPrefill(saved),
    ask: (saved?: RegistrationAnswers | null) => { if (saved) setPrefill(saved); setAsking(true); },
    cancel: () => setAsking(false),
    onWaitlist: waitlist.onList,
    leaveWaitlist: waitlist.leave,
    leaving: waitlist.leaving,
  };
}
