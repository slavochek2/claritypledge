/**
 * @file EventRoomMeet.tsx
 * @description P1114 rev2 — `/events/:slug/meet`. The shipped `/meet` composition
 * (meeting-terms-page.tsx): the certificate scrolls under a fixed bottom bar carrying
 * the decision. Level stays 3 ("Reveal the gap"); the room has no level picker.
 *
 * Section order, top to bottom: the certificate, then "Who opted in" (the roster),
 * then the fixed decision bar. The roster renders ABOVE the bar and BELOW the
 * certificate (founder-chosen: faces sit where the decision is made — seeing names
 * already opted in is the strongest thing that can sit in front of the next
 * person, so it belongs before the buttons, not after them).
 *
 * The ONE deliberate divergence from `/meet`: no understanding-number rating step,
 * and no phone-handoff action after it — both exist for a two-person handoff (host
 * holds the phone, asks the number out loud); in a room of forty nobody asks, and
 * there is no phone to hand back.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CertificateFrame,
  CertificateOathBody,
} from '@/app/components/agreements/certificate-frame';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { PersonRow } from '@/app/components/shared/PersonRow';
import { sectionsForLevel, type MeetingTermsLevel } from '@/app/content/meeting-terms';
import { PRIMARY_BUTTON_CLASS, ANSWER_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { setRoomOptIn, subscribeToRoomRoster } from '@/app/data/event-room-service';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import { EventRoomGateScreen } from './EventRoomGate';
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';
import type { EventRoomMember } from '@/app/types';

const PRINCIPLE_LEVEL: MeetingTermsLevel = 3;
const PRINCIPLE_TITLE = 'Clarity Meeting Principle';

export function EventRoomMeet() {
  const { slug, event, loading, granted } = useEventRoomAccess();
  const { self, loading: selfLoading, refresh } = useEventRoomSelf(event, granted);
  const [roster, setRoster] = useState<EventRoomMember[]>([]);

  useEffect(() => {
    if (!event) return;
    return subscribeToRoomRoster(event.id, setRoster);
  }, [event?.id]);

  const handleOptIn = useCallback(async (value: boolean) => {
    if (!self) return;
    try {
      await setRoomOptIn(self.id, value);
      await refresh();
    } catch {
      // The freeze boundary or a transient failure rejected the write — the room's
      // own frozen-state render (below, keyed on wall-clock time) already covers
      // the freeze case; a transient failure just leaves the prior answer standing.
    }
  }, [self, refresh]);

  if (loading || (granted && selfLoading)) return null;
  if (!granted) return <EventRoomGateScreen slug={slug} />;

  const isFrozen = event
    ? Date.now() >= new Date(event.datetime).getTime() + EVENT_GRACE_HOURS * 60 * 60 * 1000
    : false;

  return (
    <div data-testid="room-meet" className="pb-24">
      <h1 className="sr-only">{PRINCIPLE_TITLE}</h1>

      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <CertificateFrame
          ariaLabel={PRINCIPLE_TITLE}
          title={PRINCIPLE_TITLE}
          kicker="A commitment for this conversation"
          epigraph="We all crave being understood. Let's commit to listen."
        >
          <CertificateOathBody sections={sectionsForLevel(PRINCIPLE_LEVEL)} />
        </CertificateFrame>

        {isFrozen && (
          <div data-testid="room-frozen-notice" className="rounded-lg border border-border bg-muted p-4 text-sm">
            This has closed. Here&apos;s who opted in.
          </div>
        )}

        <div data-testid="room-roster" className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Who opted in</h2>
          {roster.length === 0 ? (
            <div data-testid="room-zero-state" className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No one has opted in yet.
            </div>
          ) : (
            <div className="space-y-2">
              {roster.map((member) => (
                <div key={member.id} data-testid="room-roster-item">
                  <PersonRow
                    profileId={member.profileId ?? member.id}
                    slug={member.profileSlug ?? ''}
                    name={member.displayName}
                    avatarColor={member.profileAvatarColor ?? '#3B82F6'}
                    avatarUrl={member.profileAvatarUrl}
                    isPledger={member.profileHasPledged}
                    earCount={member.profileEarCount}
                    linkToProfile={!!member.profileId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isFrozen && (
        <FixedBottomBar>
          <div
            data-testid="room-my-opt-in-status"
            data-opted-in={self?.optedIn === true ? 'true' : self?.optedIn === false ? 'false' : 'unanswered'}
            className="sr-only"
          >
            {self?.optedIn === true && 'You opted in.'}
            {self?.optedIn === false && 'You opted out.'}
            {self?.optedIn == null && 'You have not answered yet.'}
          </div>
          <div className="flex w-full max-w-2xl gap-2">
            <Button
              data-testid="room-opt-in-yes"
              onClick={() => handleOptIn(true)}
              size="lg"
              className={cn(PRIMARY_BUTTON_CLASS, 'flex-1')}
            >
              Opt in
            </Button>
            <Button
              data-testid="room-opt-in-no"
              onClick={() => handleOptIn(false)}
              size="lg"
              className={cn(ANSWER_BUTTON_CLASS, 'flex-1')}
            >
              Opt out
            </Button>
          </div>
        </FixedBottomBar>
      )}
    </div>
  );
}
