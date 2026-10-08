/**
 * @file EventArrivingPage.tsx
 * @description P1380 — `/events/:slug/arriving`, the "See you soon" page behind **Not yet**
 * (starting-soon email and the room's arrival question). The venue, its address and a map link,
 * the "we start sharp" line, **I'm here now** for the moment they walk in, and **I can't make
 * it**, which releases the place (founder decision 2026-10-01: allowed up to the start).
 *
 * "I can't make it" asks once before cancelling — the same confirm-before-cancel the event
 * page uses — because it is the only control here that cannot be undone from this page.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { eventsService } from '@/app/data/events-service';
import { markEventArrival } from '@/app/data/event-arrival-service';
import { NeedsConnection } from '@/app/components/offline/needs-connection';
import { EventRoomGateScreen } from '../components/EventRoomGate';
import { useEventRoomAccess } from '../components/EventRoomAccess';
import { mapsUrl, onTimeLine, venueName } from './arrival-text';
import { isSessionMismatch } from '@/lib/session-guard';
import { useSignInAgain } from '@/app/hooks/useSignInAgain';

export function EventArrivingPage() {
  const { slug, event, loading, granted, isLoggedIn, offline } = useEventRoomAccess();
  const { user, session } = useAuth();
  const viewerId = session?.user?.id ?? user?.id ?? null;
  const navigate = useNavigate();
  const signInAgain = useSignInAgain();
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);

  if (loading) return null;
  if (cancelled) {
    return (
      <section className="mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-16 text-center" data-testid="arriving-cancelled">
        <h1 className="text-2xl font-bold text-foreground">Your place is released</h1>
        <p className="text-muted-foreground">Thanks for letting us know. We hope to see you next time.</p>
        <Link to="/events" className="min-h-10 font-medium text-blue-600 hover:underline">See upcoming events</Link>
      </section>
    );
  }
  if (offline) return <NeedsConnection />;
  if (!granted || !event) return <EventRoomGateScreen slug={slug} isLoggedIn={isLoggedIn} />;

  const venue = venueName(event.location);
  const hereNow = async () => {
    setBusy(true);
    try {
      await markEventArrival(event.id);
    } catch (err) {
      console.warn('[arrival] mark failed:', err);
    }
    navigate(`/events/${event.slug}/room`);
  };
  const cantMakeIt = async () => {
    if (!viewerId) return;
    setBusy(true);
    setCancelFailed(false);
    let ok: boolean;
    try {
      ok = await eventsService.cancelRsvp(event.id, viewerId);
    } catch (err) {
      setBusy(false);
      // P1441: the client could not act as this person, so nothing was deleted.
      if (isSessionMismatch(err)) return signInAgain(event.slug, 'cancel');
      throw err;
    }
    setBusy(false);
    if (ok) setCancelled(true);
    else setCancelFailed(true);
  };

  return (
    <section
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-sm flex-col items-center justify-center space-y-6 px-4 py-10 text-center lg:min-h-[calc(100vh-5rem)]"
      data-testid="arriving-page"
    >
      <h1 className="text-2xl font-bold leading-snug text-foreground">See you soon</h1>
      <div className="space-y-1">
        {venue && <p className="text-lg font-semibold text-foreground" data-testid="arriving-venue">{venue}</p>}
        {event.location && <p className="text-base text-muted-foreground" data-testid="arriving-address">{event.location}</p>}
        {event.location && (
          <a
            href={mapsUrl(event.location)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center font-medium text-blue-600 hover:underline"
            data-testid="arriving-map"
          >
            Open in Maps
          </a>
        )}
      </div>
      <p className="text-sm text-foreground" data-testid="arriving-on-time">{onTimeLine(event.datetime)}</p>
      <div className="flex w-full flex-col items-center gap-1">
        {/* While confirming a release, the safe answer is the one primary on the page. */}
        {!confirmingCancel && <LetterPrimaryCta label="I'm here now" onClick={hereNow} disabled={busy} />}
        {!confirmingCancel ? (
          <LetterPrimaryCta label="I can't make it" variant="secondary" onClick={() => setConfirmingCancel(true)} />
        ) : (
          <div className="flex w-full flex-col items-center gap-1 pt-2" data-testid="arriving-cancel-confirm">
            <p className="text-sm text-foreground">Release your place? The host&apos;s count updates and someone else can come.</p>
            <LetterPrimaryCta label="Keep my place" onClick={() => setConfirmingCancel(false)} />
            <LetterPrimaryCta label="Yes, release my place" variant="secondary" onClick={cantMakeIt} disabled={busy} />
          </div>
        )}
        {cancelFailed && (
          <p className="text-sm text-red-600" role="alert">That didn&apos;t go through. Check your connection and try again.</p>
        )}
      </div>
    </section>
  );
}
