import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useReturnToParent } from '@/app/hooks/use-go-back';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { CheckCircle2, Calendar, MapPin, Video, ArrowRight } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { eventsService } from '@/app/data/events-service';
import type { EventWithHost } from '@/app/types';
import { formatDate, formatTime } from '../utils';
import { classifyLocation, getLocationDisplayLabel, safeLinkHref } from '../location-utils';
import { GroupChatBlock } from './GroupChatBlock';
import { AddToCalendarMenu } from './AddToCalendarMenu';
import { PrepConfirm } from '../prep/PrepConfirm';
import { EventShareRow } from './EventShareRow';
import { isHikeLayout, parseHikeDetails } from '../hike/hike-utils';
import { offersPreparation, recipeFor } from '../series-recipes';

const AUTO_REDIRECT_DELAY_MS = 10000; // 10 seconds

export function RsvpConfirm() {
  const { slug } = useParams<{ slug: string }>();
  // The event page opens this screen and marks the route state. Only then is the entry below the event, so
  // going back to it (after the 10 seconds, or from the link below) POPS and the event's own Back does not land
  // here again. After an auth callback the entry below can be a sign-up screen or another site: popping would
  // leave the app, so without the mark this REPLACES with the event.
  const location = useLocation();
  const openedByEvent = (location.state as { fromEvent?: boolean } | null)?.fromEvent === true;
  const backToEvent = useReturnToParent(`/events/${slug}`, openedByEvent);
  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupChatUrl, setGroupChatUrl] = useState<string | null>(null);
  // Round 10b (Codex): a read that FAILED is not "this event does not exist" — it gets its own state with a retry.
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Fetch event data
  useEffect(() => {
    // Round 10b: a new slug starts from nothing (no previous event's chat link), and an answer for an old slug is ignored.
    let cancelled = false;
    setLoading(true);
    setEvent(null);
    setGroupChatUrl(null);
    setLoadFailed(false);
    async function fetchEvent() {
      if (!slug) {
        setLoading(false);
        return;
      }
      let eventData: EventWithHost | null = null;
      try {
        // Round 10 (speed): this screen shows no guest list, so the event's second read (its attendees) is skipped.
        eventData = await eventsService.getEventBySlug(slug, { attendees: false, throwOnError: true });
        if (cancelled) return;
        setEvent(eventData);
      } catch (error) {
        console.error('[RsvpConfirm] Failed to fetch event:', error);
        if (!cancelled) setLoadFailed(true);
      } finally {
        // Round 10b: the page always leaves its loader, whatever the read did.
        if (!cancelled) setLoading(false);
      }

      // P1194: the moment someone registers is when the group chat matters most.
      // The caller is registered by definition here, but the gate is still the
      // service's — null comes back if the RSVP did not actually land.
      if (eventData?.hasGroupChat) {
        try {
          const url = await eventsService.getEventGroupChatUrl(eventData.id);
          if (!cancelled) setGroupChatUrl(url);
        } catch (error) {
          console.error('[RsvpConfirm] Failed to fetch group chat link:', error);
        }
      }
    }
    fetchEvent();
    return () => { cancelled = true; };
  }, [slug, attempt]);

  // Auto-redirect to event page after confirmation (only if event exists)
  useEffect(() => {
    if (!event) return; // Don't redirect if event not loaded or doesn't exist
    // P1336: with preparation on, this screen asks for it — never pulled away from under the question.
    if (offersPreparation(event)) return;
    // P1194: don't pull the page out from under someone reading a group chat
    // invite they have not tapped yet.
    if (groupChatUrl) return;

    const timer = setTimeout(() => {
      backToEvent();
    }, AUTO_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [backToEvent, event, groupChatUrl]);

  // Loading state
  if (loading) {
    return <ClarityPageLoader />;
  }

  // Round 10b: the read failed (network, server) — say so and offer the retry, never "not found". Same shape as the
  // room's own failed-read message (EventRoomMeet "We could not load the learning." + Try again).
  if (loadFailed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center" data-testid="rsvp-confirm-error">
        <p className="text-base text-muted-foreground">We could not load this page.</p>
        <Button variant="outline" className="mt-4 min-h-11" onClick={() => setAttempt((n) => n + 1)} data-testid="rsvp-confirm-retry">Try again</Button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
          <p className="text-muted-foreground mb-4">This event doesn't exist or has been removed.</p>
          <Link to="/events">
            <Button variant="outline">Back to Events</Button>
          </Link>
        </div>
      </div>
    );
  }

  // P1336: preparation on → screen 0 of the preparation (the registered box + the prep block).
  // P1542: a series whose preparation is optional (hikes) gets the same screen, in its own words.
  if (offersPreparation(event)) {
    return (
      <>
        {/* This screen hides the phone bottom bar: it keeps a Back (the shell top bar). */}
        {/* Round 5c (J): a hike's thank-you names where Back goes (it does go to the event). */}
        {recipeFor(event.seriesSlug).prepare.offer
          ? <FocusHeader onBack={backToEvent} label="Back to the event" aria-label="Back to the event" />
          : <FocusHeader onBack={backToEvent} />}
        <PrepConfirm event={event} groupChatUrl={groupChatUrl} />
      </>
    );
  }

  const eventDate = new Date(event.datetime);
  const endDate = new Date(eventDate.getTime() + event.durationMinutes * 60 * 1000);

  const locationInfo = classifyLocation(event.location);
  const locationIsUrl = locationInfo.type === 'maps'
    || locationInfo.type === 'virtual'
    || event.location.startsWith('http');

  // Event data for calendar download
  const calendarEventData = {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    slug: event.slug,
    startDate: eventDate,
    endDate: endDate,
  };

  const hikeMeetName = isHikeLayout(event) ? parseHikeDetails(event.hikeDetails)?.meetName : undefined;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* This screen hides the phone bottom bar: it keeps a Back (the shell top bar). */}
        <FocusHeader onBack={backToEvent} />
        {/* Success Card */}
        <div className="bg-card rounded-xl border border-border shadow-lg p-8 text-center">
          {/* Success Icon */}
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold mb-2">You're Registered!</h1>
          <p className="text-muted-foreground mb-6">
            We've added you to the guest list. See you there!
          </p>

          {/* Event Summary */}
          <div className="bg-muted/50 rounded-lg p-4 mb-6 text-left">
            <h2 className="font-semibold mb-3">{event.title}</h2>

            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p>{formatDate(eventDate)}</p>
                  <p className="text-muted-foreground">
                    {formatTime(eventDate)} - {formatTime(endDate)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                {locationInfo.type === 'virtual'
                  ? <Video className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  : <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                }
                <a
                  href={safeLinkHref(locationInfo.href)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`hover:underline${locationIsUrl ? ' truncate min-w-0' : ''}`}
                >
                  {/* P1403: same label as the event page for a hike. */}
                  {hikeMeetName ? `Meet at ${hikeMeetName}` : getLocationDisplayLabel(locationInfo, event.location)}
                </a>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {/* P1194: the group chat is the one action here that is time-sensitive — first. */}
            <GroupChatBlock url={groupChatUrl} />

            <AddToCalendarMenu event={calendarEventData} />

            {/* P1403 (founder 2026-10-04): the same share row as the prep confirmation, so every
                event can be passed on right after registering, not only prepared ones. */}
            <EventShareRow
              title={event.title}
              url={`${window.location.origin}/events/${event.slug}`}
              label="Bring a friend:"
              testId="rsvp-confirm-share"
              className="pt-1"
            />

            <Link
              to={`/events/${slug}`}
              className="block"
              // Keeps its href (open in a new tab, copy link); a plain click goes back the way it came.
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                backToEvent();
              }}
            >
              <Button variant="ghost" className="w-full gap-2">
                View Event Details
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {/* Auto-redirect notice — suppressed when a group chat invite is on screen (P1194) */}
          {!groupChatUrl && (
            <p className="text-xs text-muted-foreground mt-6">
              Redirecting to event page in a few seconds...
            </p>
          )}
        </div>

        {/* Back to events link */}
        <div className="text-center mt-6">
          <Link
            to="/events"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Browse more events
          </Link>
        </div>
      </div>
    </div>
  );
}
