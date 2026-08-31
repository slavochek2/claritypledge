import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Calendar, MapPin, Video, ArrowRight, Download, ChevronDown } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { eventsService } from '@/app/data/events-service';
import type { EventWithHost } from '@/app/types';
import { formatDate, formatTime, downloadICSFile, getGoogleCalendarUrl, getOutlookUrl, getOffice365Url } from '../utils';
import { classifyLocation, getLocationDisplayLabel, safeLinkHref } from '../location-utils';
import { GroupChatBlock } from './GroupChatBlock';

const AUTO_REDIRECT_DELAY_MS = 10000; // 10 seconds

export function RsvpConfirm() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const [groupChatUrl, setGroupChatUrl] = useState<string | null>(null);
  const calendarMenuRef = useRef<HTMLDivElement>(null);

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
    // P1194: don't pull the page out from under someone reading a group chat
    // invite they have not tapped yet.
    if (groupChatUrl) return;

    const timer = setTimeout(() => {
      navigate(`/events/${slug}`);
    }, AUTO_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [navigate, slug, event, groupChatUrl]);

  // Close calendar menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarMenuRef.current && !calendarMenuRef.current.contains(e.target as Node)) {
        setCalendarMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
                  {getLocationDisplayLabel(locationInfo, event.location)}
                </a>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {/* P1194: the group chat is the one action here that is time-sensitive — first. */}
            <GroupChatBlock url={groupChatUrl} variant="primary" />

            <div className="relative" ref={calendarMenuRef}>
              <Button
                onClick={() => setCalendarMenuOpen(!calendarMenuOpen)}
                variant="outline"
                className="w-full gap-2"
              >
                <Calendar className="w-4 h-4" />
                Add to Calendar
                <ChevronDown className="w-3 h-3 ml-auto" />
              </Button>
              {calendarMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-20 overflow-hidden">
                  <a
                    href={getGoogleCalendarUrl(calendarEventData)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                    onClick={() => setCalendarMenuOpen(false)}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google Calendar
                  </a>
                  <a
                    href={getOutlookUrl(calendarEventData)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                    onClick={() => setCalendarMenuOpen(false)}
                  >
                    {/* Outlook logo */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L2 5v14l10 3V2z" fill="#0078D4"/>
                      <ellipse cx="7" cy="12" rx="3" ry="4" fill="#fff"/>
                      <path d="M13 7h9v10h-9V7z" fill="#0078D4"/>
                      <path d="M22 8v8l-4-2.5V10.5L22 8z" fill="#1490DF"/>
                      <path d="M13 7h5v10h-5V7z" fill="#28A8EA"/>
                    </svg>
                    Outlook.com
                  </a>
                  <a
                    href={getOffice365Url(calendarEventData)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                    onClick={() => setCalendarMenuOpen(false)}
                  >
                    {/* Microsoft 365 logo */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                      <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                      <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                    </svg>
                    Microsoft 365
                  </a>
                  <button
                    onClick={() => {
                      downloadICSFile(calendarEventData);
                      setCalendarMenuOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors w-full text-left border-t border-border"
                  >
                    <Download className="w-5 h-5 text-muted-foreground" />
                    Download .ics file
                  </button>
                </div>
              )}
            </div>

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
