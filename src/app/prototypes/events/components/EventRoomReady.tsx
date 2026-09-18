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
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { SliderTrack } from '@/app/components/partners/slider-track';
import { PRIMARY_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { getRoomReadinessDistribution, setRoomReadiness } from '@/app/data/event-room-service';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { useAuth } from '@/auth';
import { cn } from '@/lib/utils';
import { EventRoomGateScreen } from './EventRoomGate';
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';

const QUESTION = 'How up for thinking are you right now?';
const MIDPOINT_LABEL = 'Neutral';
const MIDPOINT_VALUE = 5;
const POLE_LABELS = { low: 'Stay on the surface', high: 'Go deep' };
/** Deliberately the same sentence the general /ready uses for its own marks — this is the
 * screen-reader-only description of the `others` dots, and the two surfaces render the
 * identical thing. Scoped to this event's room rather than the whole site. */
const DISTRIBUTION_LABEL = 'How up for thinking others in this room are right now';

export function EventRoomReady() {
  const { slug, event, loading, granted, isLoggedIn } = useEventRoomAccess();
  const { self, loading: selfLoading, refresh } = useEventRoomSelf(event, granted);
  const navigate = useNavigate();
  const { user } = useAuth();
  const capture = useRoomCapture();

  // P1307 D12: the switch starts OFF — tapping it on is the consent (a pre-ticked switch
  // followed by Continue is not valid consent: Planet49, C-673/17; GDPR Recital 32). If this
  // person is already being transcribed for this event it shows ON, and switching it off ends
  // their own capture (Part 5).
  const beingTranscribed = event ? capture.isCapturingForEvent(event.id) : false;
  const [transcribeOn, setTranscribeOn] = useState(false);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (beingTranscribed) setTranscribeOn(true);
  }, [beingTranscribed]);

  const handleTranscribeToggle = useCallback(() => {
    const next = !transcribeOn;
    setTranscribeOn(next);
    if (!next && beingTranscribed && capture.roomId) void capture.endMyCapture(capture.roomId);
  }, [transcribeOn, beingTranscribed, capture]);

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
    if (starting) return;
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
    // P1307 D1: switch on → join this event's room and start capture; the person lands on
    // /meet exactly as before, never on /transcribe. Unlike the readiness write above, a
    // failure here is NOT swallowed: they still land on /meet, with no bar and a message.
    let transcriptionFailed = false;
    if (transcribeOn && event && !beingTranscribed) {
      setStarting(true);
      const result = await capture.startCapture({
        eventId: event.id,
        displayName: user?.name || user?.email || 'Participant',
      });
      setStarting(false);
      // A join that failed and a microphone that could not open both mean nothing is being
      // transcribed — the person is told the same thing either way.
      transcriptionFailed = !result.started;
    }
    navigate(`/events/${slug}/meet`, { state: { fromReady: true, transcriptionFailed } });
  }, [starting, self, value, refresh, transcribeOn, event, beingTranscribed, capture, user, navigate, slug]);

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

          {/* P1307 D2: a separate question from the slider, so it sits visibly apart from it —
              pt-4 on top of the column's own gap (founder review of the prototype). Styled as
              /live's switch. Only a tap turns it on (D12). */}
          <div className="w-full pt-4">
            <button
              type="button"
              role="switch"
              aria-checked={transcribeOn}
              aria-label={
                transcribeOn
                  ? 'Transcribe for AI insights — recording enabled'
                  : 'Transcribe for AI insights — recording disabled'
              }
              onClick={handleTranscribeToggle}
              data-testid="transcribe-toggle"
              className={cn(
                'flex items-center gap-3 w-full min-h-11 px-3 py-2 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                transcribeOn ? 'bg-blue-50 border-blue-200' : 'bg-muted border-border',
              )}
            >
              <div
                className={cn(
                  'relative flex-shrink-0 w-9 h-5 rounded-full transition-colors',
                  transcribeOn ? 'bg-blue-400' : 'bg-muted-foreground/30',
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
                    transcribeOn ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">Transcribe for AI insights</span>
                <span className="text-xs text-muted-foreground">
                  {transcribeOn ? 'Record audio and share transcript with others in the room' : 'Not transcribed'}
                </span>
              </div>
            </button>
            <span className="sr-only" aria-live="polite">
              {transcribeOn
                ? 'Transcription enabled. Your audio is recorded and your transcript is shared with others in the room.'
                : 'Transcription disabled.'}
            </span>
          </div>

          <div className="flex flex-col gap-4">
            <Button
              onClick={handleContinue}
              size="lg"
              className={cn(PRIMARY_BUTTON_CLASS, 'w-full')}
              aria-busy={starting}
              data-testid="room-ready-continue"
            >
              {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Continue
            </Button>

            {/* Founder, 2026-09-14: a reminder, not an agreement — attendees are signed in and
                accepted the terms already. Shown only while transcription is on; with it off
                nothing is recorded and there is nothing to remind anyone of. The consent for
                recording is the switch itself (D12). */}
            {transcribeOn && (
              <p className="text-sm text-muted-foreground text-center" data-testid="room-ready-terms">
                Transcription follows our{' '}
                <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Terms
                </a>{' '}
                and{' '}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Privacy Policy
                </a>
                .
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
