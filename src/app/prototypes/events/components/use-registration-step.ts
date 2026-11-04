/**
 * @file use-registration-step.ts
 * @description P1529 D16: the event page's registration step for a flow that asks before the seat, and the one place
 * that turns a registration's outcome into what the page shows. Other flows only use the outcome half.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { registerForEvent, type RegistrationAnswers } from '@/app/data/event-registration';
import { isSessionMismatch } from '@/lib/session-guard';

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
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (answers: RegistrationAnswers) => {
    if (!opts.event || !opts.userId) return;
    setBusy(true);
    try {
      const result = await registerForEvent(opts.event, opts.userId, answers);
      if (result === 'ok' || result === 'already') {
        setAsking(false);
        opts.onRegistered();
      } else if (result === 'full' || result === 'cancelled') {
        setAsking(false);
        opts.onRefused(result);
      } else {
        toast.error("Couldn't register you. Please try again.");
      }
    } catch (err) {
      if (isSessionMismatch(err)) opts.onSessionLost();
      else throw err;
    } finally {
      setBusy(false);
    }
  };

  return { asking, busy, ask: () => setAsking(true), cancel: () => setAsking(false), submit };
}
