/**
 * @file use-quote-consent.ts
 * @description P1542 review rounds 9–11: the "you may quote me" box, with consent kept ONLY on the server.
 *  - The box shows what the server holds (true when there is no saved row — founder 2026-10-05, ticked from the start).
 *  - Each click is written at once with the time it was made (set_event_quote_ok). The SERVER orders the clicks
 *    (20261029200300): an older click landing late — from this tab, a remount, another tab or device — changes nothing.
 *    So nothing here queues, waits or blocks: the words' saves and the finish go whenever they go, and since an answer
 *    save can never raise the permission (20261029200200), the words always sit under the latest click's choice.
 *  - A failed write says so and shows the server's value again (one read, from a visible tab, cancelled if the close
 *    goes away — round 12, F2); the person can click again. Only the latest click's failure does this.
 *  - A re-read never overrides a click whose write is still out; that click's success is what the box shows (F3).
 *    A latest click that failed while an older write was still out is not forgotten: once the last write settles,
 *    the box re-reads the server then (final review, Codex: the older tick may have landed meanwhile).
 *  - While the box shows UNTICKED, every answer save also sends the refusal (round 12, F1, in EventClosePage): an
 *    answer save can always lower the permission (20261029200200), so a failed or late box write cannot leave the
 *    words under consent the person withdrew on screen.
 *  - Entering "What did you like" re-reads the server once (from a visible tab — metered rule 3), so a refusal made on
 *    another device since this tab opened is what the box shows. A click made while that read is out wins over it.
 * Accepted (recorded in the spec): a tab already ON that step when the person refused elsewhere still shows the tick;
 * submitting words there sends no permission, so the server keeps the refusal regardless.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getEventClose, setEventQuoteOk } from '@/app/data/event-close-service';
import { whenVisible } from '../when-visible';

export function useQuoteConsent(eventId: string, saved: boolean | null, step: string) {
  const [quoteOk, setQuoteOkState] = useState(saved ?? true);
  const clicks = useRef(0); // bumped on every click: a read or a failure from before it is stale
  const inFlight = useRef(0); // box writes not yet answered (round 12, F3: a re-read never overrides one)
  const failedClick = useRef<number | null>(null); // the latest click's write failed while others were still out
  const mounted = useRef(true);
  const lastClick = useRef<{ value: boolean; at: string } | null>(null); // final review (Z1): its ORIGINAL time
  const cancels = useRef(new Set<() => void>());
  useEffect(() => {
    mounted.current = true;
    const pending = cancels.current;
    return () => { mounted.current = false; pending.forEach((c) => c()); pending.clear(); };
  }, []);
  /** Show the server's value — from a visible tab, while this close is still drawn, unless the person has clicked
   *  since or a click is still being written (round 12, F2/F3). */
  const showServer = useCallback((afterClick: number) => {
    if (inFlight.current > 0) return;
    let cancelled = false;
    const cancelWait = whenVisible(() => {
      getEventClose(eventId)
        .then((c) => {
          if (cancelled || !mounted.current || clicks.current !== afterClick || inFlight.current > 0) return;
          setQuoteOkState(c.quoteOk ?? true);
        })
        .catch(() => undefined) // the box keeps what it shows
        .finally(() => cancels.current.delete(cancel)); // settled: nothing left to cancel (final review, LOW)
    });
    const cancel = () => { cancelled = true; cancelWait(); cancels.current.delete(cancel); };
    cancels.current.add(cancel);
    return cancel;
  }, [eventId]);
  const toggle = useCallback((next: boolean) => {
    clicks.current += 1;
    const mine = clicks.current;
    inFlight.current += 1;
    setQuoteOkState(next);
    const at = new Date().toISOString();
    lastClick.current = { value: next, at };
    void setEventQuoteOk(eventId, next, at).catch(() => false).then((ok) => {
      inFlight.current -= 1;
      if (!mounted.current) return;
      if (mine !== clicks.current) {
        // Not the latest click: not news — unless the latest one failed while this write was out. Then, with no write
        // left, the server's value (this older click may have just landed) is what the box must show.
        if (inFlight.current === 0 && failedClick.current === clicks.current) showServer(clicks.current);
        return;
      }
      if (ok) return setQuoteOkState(next); // F3: the person's latest click is what the box shows
      toast.error('Could not save. Please check your connection.');
      failedClick.current = mine; // showServer waits while another write is out; the last one to settle re-reads
      showServer(mine);
    });
  }, [eventId, showServer]);
  const lastStep = useRef(step);
  useEffect(() => {
    const entered = step === 'appreciate' && lastStep.current !== 'appreciate';
    lastStep.current = step;
    if (entered) return showServer(clicks.current);
  }, [step, showServer]);
  const shown = useRef(quoteOk);
  shown.current = quoteOk;
  /** What an answer save sends as p_quote_ok: NULL under a ticked box (an answer save never raises it); false under an
   *  unticked one (round 12, F1). Before that, final review (Z1): the person's latest untick is re-sent with its
   *  ORIGINAL click time, so the server records that time (quote_ok_at) and an older tick landing late loses. Never the
   *  server's now(): a device clock running behind would then have its next real tick ignored. If the re-send fails
   *  too, the save still goes and still lowers. */
  const forAnswerSave = useCallback(async (): Promise<boolean | null> => {
    if (shown.current) return null;
    const c = lastClick.current;
    if (c && !c.value) await setEventQuoteOk(eventId, false, c.at).catch(() => false);
    return false;
  }, [eventId]);
  return { quoteOk, toggle, forAnswerSave };
}
