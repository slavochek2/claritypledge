/**
 * @file EventRoomReady.tsx
 * @description P1114 rev2 — `/events/:slug/ready`. The shipped `/ready` composition
 * (ready-page.tsx), event-scoped: one question, the shared `SliderTrack`, `Continue`,
 * vertically centred. No caption under the slider — the UI Contract's "Readiness
 * caption" row is retired, founder-annotated "delete" (spec Solution, "REVISED (2)").
 *
 * Gated the same way as every room door: EventRoomGate.tsx's screen renders here too
 * when the caller is not registered + signed in.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SliderTrack } from '@/app/components/partners/slider-track';
import { PRIMARY_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { setRoomReadiness } from '@/app/data/event-room-service';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import { cn } from '@/lib/utils';
import { EventRoomGateScreen } from './EventRoomGate';
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';

const QUESTION = 'How up for thinking are you right now?';
const MIDPOINT_LABEL = 'Neutral';
const MIDPOINT_VALUE = 5;
const POLE_LABELS = { low: 'Keep it light', high: 'Go deep' };

export function EventRoomReady() {
  const { slug, event, loading, granted } = useEventRoomAccess();
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
  if (!granted) return <EventRoomGateScreen slug={slug} />;

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
      className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-10 lg:min-h-[calc(100vh-5rem)]"
    >
      <h1 className="sr-only">Before you meet</h1>

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
          />
        </div>

        <Button onClick={handleContinue} size="lg" className={cn(PRIMARY_BUTTON_CLASS, 'w-full')}>
          Continue
        </Button>
      </div>
    </div>
  );
}
