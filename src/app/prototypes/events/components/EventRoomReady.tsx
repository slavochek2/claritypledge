/**
 * @file EventRoomReady.tsx
 * @description P1114 rev2 — `/events/:slug/ready`. The shipped `/ready` composition
 * (ready-page.tsx), event-scoped: one question, the shared `SliderTrack`, `Continue`,
 * vertically centred. No caption under the slider — the UI Contract's "Readiness
 * caption" row is retired, founder-annotated "delete" (spec Solution, "REVISED (2)").
 *
 * Gated the same way as every room door: EventRoomGate.tsx's screen renders here too
 * when the caller is not registered + signed in.
 *
 * Back button (2026-08-21 founder repro): goes to the event page — the step before
 * this one in the room's pipeline (event page → /room → /ready). Uses FocusHeader
 * per src.md's focus-page convention, not a hand-rolled Link.
 *
 * Readiness distribution (2026-08-21): everyone else in THIS room, drawn as faint marks on
 * the caller's own track via SliderTrack's `others` — the general /ready's P1083 treatment,
 * which this page had dropped. Anonymous by construction, not by convention: the values
 * arrive from a SECURITY DEFINER RPC carrying no identifiers, because the roster row next
 * to it is public by name and the two contracts would otherwise contradict each other. See
 * supabase/migrations/20260821170000_p1114_room_readiness_distribution.sql.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { SliderTrack } from '@/app/components/partners/slider-track';
import { PRIMARY_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { getRoomReadinessDistribution, setRoomReadiness } from '@/app/data/event-room-service';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import { cn } from '@/lib/utils';
import { EventRoomGateScreen } from './EventRoomGate';
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';

const QUESTION = 'How up for thinking are you right now?';
const MIDPOINT_LABEL = 'Neutral';
const MIDPOINT_VALUE = 5;
const POLE_LABELS = { low: 'Keep it light', high: 'Go deep' };
/** Deliberately the same sentence the general /ready uses for its own marks — this is the
 * screen-reader-only description of the `others` dots, and the two surfaces render the
 * identical thing. Scoped to this event's room rather than the whole site. */
const DISTRIBUTION_LABEL = 'How up for thinking others in this room are right now';

export function EventRoomReady() {
  const { slug, event, loading, granted, isLoggedIn } = useEventRoomAccess();
  const { self, loading: selfLoading, refresh } = useEventRoomSelf(event, granted);
  const navigate = useNavigate();

  const [value, setValue] = useState(MIDPOINT_VALUE);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (self?.readinessValue != null) {
      setValue(self.readinessValue);
      setTouched(true);
    }
  }, [self?.readinessValue]);

  // Everyone else's answers, drawn as faint marks resting on this same track — the general
  // /ready's `others` treatment (P1083), which the room's copy of this page had dropped
  // (founder, 2026-08-21: "i want the same functionality in the event rooms!").
  //
  // Fetched once on arrival, deliberately NOT subscribed to the room's realtime channel:
  // marks that shuffle while someone is deciding their own number turn a static reference
  // into a moving one, and the value being answered here is "right now, for you". The
  // general page has the same one-shot behaviour.
  const [others, setOthers] = useState<number[]>([]);
  useEffect(() => {
    if (!event || !granted) return;
    let cancelled = false;
    void getRoomReadinessDistribution(event.id).then((values) => {
      // getRoomReadinessDistribution resolves to [] on its own failures, so there is no
      // error branch to handle here — an absent distribution renders as no marks.
      if (!cancelled) setOthers(values);
    });
    return () => { cancelled = true; };
  }, [event?.id, granted]);

  const handleChange = useCallback((next: number) => {
    setValue(next);
    setTouched(true);
  }, []);

  const handleContinue = useCallback(async () => {
    if (self) {
      try {
        await setRoomReadiness(self.id, value);
        await refresh();
      } catch {
        // The freeze boundary or a transient failure rejected the write — the
        // person still moves on to the principle, which shows the correct
        // closed/open state on arrival rather than stalling here on an error.
      }
    }
    navigate(`/events/${slug}/meet`, { state: { fromReady: true } });
  }, [self, value, refresh, navigate, slug]);

  if (loading || (granted && selfLoading)) return null;
  if (!granted) return <EventRoomGateScreen slug={slug} isLoggedIn={isLoggedIn} />;

  const isFrozen = event
    ? Date.now() >= new Date(event.datetime).getTime() + EVENT_GRACE_HOURS * 60 * 60 * 1000
    : false;
  if (isFrozen) {
    navigate(`/events/${slug}/meet`, { replace: true });
    return null;
  }

  return (
    <div
      data-testid="room-ready"
      className="flex min-h-[calc(100vh-4rem)] flex-col px-4 py-10 lg:min-h-[calc(100vh-5rem)]"
    >
      <h1 className="sr-only">Before you meet</h1>

      {/* max-w-2xl, NOT the max-w-sm of the question column below it (founder, 2026-08-21:
          "for desktop not sure if this is a good place to put it? you tell me .. let's be
          consistent and user friendly"). Pinned to the narrow centred column, the link
          floated at roughly page-centre above a tall empty gap, reading as a stray control
          rather than as page chrome. This is the SAME container the room's own /meet gives
          its back link, so walking /ready → /meet no longer jumps the link sideways —
          which is the concrete "consistent" the question was asking about. The question
          group below stays max-w-sm and stays vertically centred; only the chrome moves. */}
      <div className="mx-auto w-full max-w-2xl">
        <FocusHeader
          onBack={() => navigate(`/events/${slug}`)}
          /* Visible label is bare "Back" everywhere in the room, on the founder's
             instruction (2026-08-21: "simplify, call it back everywhere"). The aria-label
             keeps the destination for screen readers, matching letter-overview-page.tsx,
             which already pairs label="Back" with a descriptive aria-label. */
          label="Back"
          aria-label="Back to event"
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-sm flex-col gap-10">
          <p className="text-center text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            {QUESTION}
          </p>

          <div className="pt-4">
            <SliderTrack
              value={value}
              onChange={handleChange}
              showValue={false}
              ariaLabel={QUESTION}
              midpointLabel={MIDPOINT_LABEL}
              poleLabels={POLE_LABELS}
              muted={!touched}
              bipolarFill
              expandedHitArea
              others={others}
              othersLabel={DISTRIBUTION_LABEL}
            />
          </div>

          <Button onClick={handleContinue} size="lg" className={cn(PRIMARY_BUTTON_CLASS, 'w-full')}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
