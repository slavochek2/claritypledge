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
import { clearRegistrationDraft, saveRegistrationDraft } from '@/app/data/registration-draft';
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
  /** The event is full for this person: the same form joins the waiting list. */
  full?: boolean;
  /** Signed out: the answers are kept and the person goes to the normal sign-up. */
  onSignIn?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState(false);
  const [prefill, setPrefill] = useState<RegistrationAnswers | null>(null);
  const waitlist = useWaitlistState(opts.event, opts.userId, !!opts.full);
  const slug = opts.event?.slug;

  const submit = async (answers: RegistrationAnswers) => {
    if (!opts.event || !slug) return;
    if (!opts.userId) {
      // Signed out. Kept only if the browser lets us; without it the form simply opens empty on the way back.
      saveRegistrationDraft(slug, opts.full ? 'waitlist' : 'register', answers);
      setAsking(false);
      opts.onSignIn?.();
      return;
    }
    setBusy(true);
    try {
      if (opts.full) {
        const listed = await joinWaitlist(slug, opts.userId, answers);
        if (listed === 'ok' || listed === 'already') {
          waitlist.setOnList(true);
          clearRegistrationDraft(slug);
          setAsking(false);
          return;
        }
        if (listed === 'cancelled') { setAsking(false); opts.onRefused('cancelled'); return; }
        if (listed !== 'not_full' && listed !== 'registered') { toast.error("Couldn't join the waiting list. Please try again."); return; }
        // 'not_full' or 'registered': a place is free after all, so register below
      }
      const result = await registerForEvent(opts.event, opts.userId, answers);
      if (result === 'ok' || result === 'already') {
        clearRegistrationDraft(slug);
        setAsking(false);
        opts.onRegistered();
      } else if (result === 'full') {
        // The answers stay (the form keeps them; a saved draft stays too). The page offers the waiting list.
        setFilled(true);
        setAsking(false);
        opts.onRefused('full');
      } else if (result === 'cancelled') {
        setAsking(false);
        opts.onRefused('cancelled');
      } else {
        toast.error("Couldn't register you. Please try again.");
      }
    } catch (err) {
      // A lost session signs in again; anything else keeps the step open with the answers and says to try again.
      if (isSessionMismatch(err)) opts.onSessionLost();
      else toast.error("Couldn't register you. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return {
    asking, busy, submit,
    /** Answers saved before sign-up, filling the form. */
    prefill,
    /** "This event just filled up." is showing: a place went while the person was registering or signing in. */
    filled,
    markFilled: () => setFilled(true),
    keepAnswers: (saved: RegistrationAnswers) => setPrefill(saved),
    ask: (saved?: RegistrationAnswers | null) => { if (saved) setPrefill(saved); setAsking(true); },
    cancel: () => setAsking(false),
    onWaitlist: waitlist.onList,
    leaveWaitlist: waitlist.leave,
  };
}
