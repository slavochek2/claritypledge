import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import {
  ArrowLeft,
  MapPin,
  Users,
  CheckCircle2,
  CalendarPlus,
  X,
  ChevronDown,
  Download,
  Pencil,
  Ban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEventBySlug, mockCurrentUser, isUserRsvpd, isEventFull, cancelEvent, cancelRsvp } from '../mock-data';
import { formatTime, downloadICSFile, getGoogleCalendarUrl, getTimezoneLabel } from '../utils';

export function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const event = slug ? getEventBySlug(slug) : undefined;

  // Check if user is already RSVP'd (from mock data)
  const alreadyRsvpd = event ? isUserRsvpd(event.id) : false;

  // Local state for new RSVPs during this session
  const [justRsvpd, setJustRsvpd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const calendarMenuRef = useRef<HTMLDivElement>(null);

  const isRsvpd = alreadyRsvpd || justRsvpd;

  // Check if current user is the host (mock: compare against mock user ID)
  const isHost = mockCurrentUser.isLoggedIn && event?.hostId === mockCurrentUser.id;

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

  // Show toast if user just signed up and was redirected here to RSVP
  useEffect(() => {
    if (searchParams.get('action') === 'rsvp' && mockCurrentUser.isLoggedIn) {
      toast.success('Account created! Click RSVP to confirm your spot.');
      // Clear the action param from URL
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  // Show cancelled state
  if (event.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⛔</div>
          <h1 className="text-2xl font-bold mb-2">Event Cancelled</h1>
          <p className="text-muted-foreground mb-2">{event.title}</p>
          <p className="text-sm text-muted-foreground mb-4">This event has been cancelled by the organizer.</p>
          <Link to="/events">
            <Button variant="outline">Back to Events</Button>
          </Link>
        </div>
      </div>
    );
  }

  const eventDate = new Date(event.datetime);
  const endDate = new Date(eventDate.getTime() + event.durationMinutes * 60 * 1000);
  const isPast = event.status === 'completed';
  const isFull = isEventFull(event);

  const handleRsvp = async () => {
    if (!mockCurrentUser.isLoggedIn) {
      navigate('/signup?redirect=/events/' + slug + '&action=rsvp');
      return;
    }

    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setJustRsvpd(true);
    setIsLoading(false);
    navigate(`/events/${slug}/confirm`);
  };

  const handleCancelRsvp = async () => {
    if (!confirm('Cancel your RSVP for this event?')) return;
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    cancelRsvp(event.id);
    setJustRsvpd(false);
    setIsLoading(false);
  };

  const handleCancelEvent = async () => {
    if (!confirm('Cancel this event? All attendees will lose their RSVP.')) return;
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    cancelEvent(event.id);
    setIsLoading(false);
    navigate('/events');
  };

  // Event data for calendar utilities
  const calendarEventData = {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    slug: event.slug,
    startDate: eventDate,
    endDate: endDate,
  };

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header Gradient */}
      <div
        className="w-full h-32 md:h-48"
        style={{
          background: `linear-gradient(135deg, ${event.hostAvatarColor}40 0%, ${event.hostAvatarColor}20 100%)`,
        }}
      />

      {/* Content - Two column layout on desktop */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Back link */}
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Events
        </Link>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column - Event Details */}
          <div className="flex-1">
            <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
              {/* Title */}
              <h1 className="text-2xl md:text-3xl font-bold mb-4">{event.title}</h1>

              {/* Host Controls - right after title for immediate visibility */}
              {isHost && !isPast && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-900">You're hosting this event</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/events/${slug}/edit`)}
                        className="gap-1.5 bg-white"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEvent}
                        disabled={isLoading}
                        className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 bg-white"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Cancel Event
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Date & Time */}
              <div className="flex items-center gap-3 mb-3 text-muted-foreground">
                <CalendarPlus className="w-5 h-5" />
                <div>
                  <span className="font-medium text-foreground">
                    {eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="mx-2">·</span>
                  <span>{formatTime(eventDate)} - {formatTime(endDate)} ({getTimezoneLabel(event.timezone || 'America/Los_Angeles')})</span>
                </div>
              </div>

              {/* Location - clickable to open Google Maps */}
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 mb-4 text-muted-foreground hover:text-blue-600 transition-colors group"
              >
                <MapPin className="w-5 h-5" />
                <span className="group-hover:underline">{event.location}</span>
              </a>

              {/* Add to Calendar */}
              {!isPast && (
                <div className="relative mb-6" ref={calendarMenuRef}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendarMenuOpen(!calendarMenuOpen)}
                    className="gap-2"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    Add to Calendar
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                  {calendarMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-20 overflow-hidden min-w-[200px]">
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
                      <button
                        onClick={() => {
                          downloadICSFile(calendarEventData);
                          setCalendarMenuOpen(false);
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors w-full text-left"
                      >
                        <Download className="w-5 h-5 text-muted-foreground" />
                        Download .ics file
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Description - Markdown rendered */}
              <div className="prose prose-sm max-w-none text-muted-foreground mb-6 pt-4 border-t border-border">
                <ReactMarkdown>{event.description}</ReactMarkdown>
              </div>

              {/* RSVP Section - Hidden for host (they're automatically attending) */}
              {!isHost && (
              <div>
                {isPast ? (
                  <Button disabled className="w-full" size="lg" data-testid="rsvp-button">
                    Event Ended
                  </Button>
                ) : isFull && !isRsvpd ? (
                  <Button disabled className="w-full" size="lg" data-testid="rsvp-button">
                    Event Full
                  </Button>
                ) : isRsvpd ? (
                  /* Logged in + RSVP'd - show confirmation */
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="font-semibold text-green-800">You're Registered!</p>
                        <p className="text-sm text-green-700">We'll see you there</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelRsvp}
                      disabled={isLoading}
                      className="text-muted-foreground hover:text-red-600 hover:bg-white/50"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel RSVP
                    </Button>
                  </div>
                ) : mockCurrentUser.isLoggedIn ? (
                  <Button
                    onClick={handleRsvp}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                    size="lg"
                    disabled={isLoading}
                    data-testid="rsvp-button"
                  >
                    {isLoading ? 'Registering...' : 'RSVP'}
                  </Button>
                ) : (
                  <Button onClick={handleRsvp} className="w-full bg-blue-500 hover:bg-blue-600 text-white" size="lg" data-testid="rsvp-button">
                    Create Account to RSVP
                  </Button>
                )}
              </div>
              )}
            </div>
          </div>

          {/* Right Column - Organizer & Participants */}
          <div className="lg:w-80 lg:flex-shrink-0 space-y-6">
            {/* Organizer Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4">Event Organizer</h2>

              <Link
                to={`/p/${event.hostSlug}`}
                className="flex flex-col items-center text-center w-full p-3 -m-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white font-semibold text-xl mb-2"
                  style={{ backgroundColor: event.hostAvatarColor }}
                >
                  {event.hostName.charAt(0)}
                </div>
                <p className="font-semibold">{event.hostName}</p>
                <p className="text-sm text-muted-foreground">{event.hostRole}</p>
              </Link>
            </div>

            {/* Participants Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4">
                Participants ({event.attendees.length}{event.maxAttendees ? `/${event.maxAttendees}` : ''})
              </h2>
              <div className="space-y-2">
                {event.attendees.map(attendee => (
                  <Link
                    key={attendee.id}
                    to={`/p/${attendee.slug}`}
                    className="flex items-center gap-3 w-full p-2 rounded-lg text-left hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                      style={{ backgroundColor: attendee.avatarColor }}
                    >
                      {attendee.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {attendee.name}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {isPast ? 'Attended' : 'Going'}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom padding */}
      <div className="h-12" />
    </div>
  );
}
