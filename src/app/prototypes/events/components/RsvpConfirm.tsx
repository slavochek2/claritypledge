import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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

const AUTO_REDIRECT_DELAY_MS = 10000; // 10 seconds

export function RsvpConfirm() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupChatUrl, setGroupChatUrl] = useState<string | null>(null);

  // Fetch event data
  useEffect(() => {
    async function fetchEvent() {
      if (!slug) {
        setLoading(false);
        return;
      }
      const eventData = await eventsService.getEventBySlug(slug);
      setEvent(eventData);
      setLoading(false);

      // P1194: the moment someone registers is when the group chat matters most.
      // The caller is registered by definition here, but the gate is still the
      // service's — null comes back if the RSVP did not actually land.
      if (eventData?.hasGroupChat) {
        try {
          setGroupChatUrl(await eventsService.getEventGroupChatUrl(eventData.id));
        } catch (error) {
          console.error('[RsvpConfirm] Failed to fetch group chat link:', error);
        }
      }
    }
    fetchEvent();
  }, [slug]);

  // Auto-redirect to event page after confirmation (only if event exists)
  useEffect(() => {
    if (!event) return; // Don't redirect if event not loaded or doesn't exist
    // P1336: with preparation on, this screen asks for it — never pulled away from under the question.
    if (event.preparationEnabled) return;
    // P1194: don't pull the page out from under someone reading a group chat
    // invite they have not tapped yet.
    if (groupChatUrl) return;

    const timer = setTimeout(() => {
      navigate(`/events/${slug}`);
    }, AUTO_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [navigate, slug, event, groupChatUrl]);

  // Loading state
  if (loading) {
    return <ClarityPageLoader />;
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
  if (event.preparationEnabled) {
    return <PrepConfirm event={event} groupChatUrl={groupChatUrl} />;
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
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
                  {(isHikeLayout(event) && parseHikeDetails(event.hikeDetails)?.meetName) ? `Meet at ${parseHikeDetails(event.hikeDetails)?.meetName}` : getLocationDisplayLabel(locationInfo, event.location)}
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

            <Link to={`/events/${slug}`} className="block">
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
