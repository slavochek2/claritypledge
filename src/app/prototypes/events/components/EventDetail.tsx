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
  Ban,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/auth';
import {
  getEventBySlug,
  getEventAttendees,
  getEventAttendeeCount,
  isUserRsvpd,
  rsvpToEvent,
  cancelRsvp as cancelRsvpApi,
  cancelEvent as cancelEventApi,
  type EventWithHost,
  type EventAttendee
} from '@/app/data/api';
import { formatTime, downloadICSFile, getGoogleCalendarUrl, getOutlookUrl, getOffice365Url, getTimezoneLabel } from '../utils';

export function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();

  // Data states
  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [isRsvpd, setIsRsvpd] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const calendarMenuRef = useRef<HTMLDivElement>(null);

  // Confirmation dialog states
  const [showCancelRsvpDialog, setShowCancelRsvpDialog] = useState(false);
  const [showCancelEventDialog, setShowCancelEventDialog] = useState(false);

  // Fetch event data
  useEffect(() => {
    async function loadEventData() {
      if (!slug) return;

      setDataLoading(true);
      setDataError(null);

      try {
        const eventData = await getEventBySlug(slug);
        if (!eventData) {
          setDataError('Event not found');
          setDataLoading(false);
          return;
        }
        setEvent(eventData);

        // Fetch attendees and count in parallel
        const [attendeesList, count] = await Promise.all([
          getEventAttendees(eventData.id),
          getEventAttendeeCount(eventData.id),
        ]);
        setAttendees(attendeesList);
        setAttendeeCount(count);

        // Check if current user is RSVP'd
        if (user) {
          const rsvpStatus = await isUserRsvpd(eventData.id, user.id);
          setIsRsvpd(rsvpStatus);
        }
      } catch (err) {
        console.error('Error loading event:', err);
        setDataError('Failed to load event');
      } finally {
        setDataLoading(false);
      }
    }

    loadEventData();
  }, [slug, user]);

  // Check if current user is the host
  const isHost = user && event?.hostId === user.id;

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
    if (searchParams.get('action') === 'rsvp' && user) {
      toast.success('Account created! Click RSVP to confirm your spot.');
      // Clear the action param from URL
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, user]);

  // Loading state
  if (dataLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error or not found state
  if (dataError || !event) {
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

  const isCancelled = event.status === 'cancelled';
  const eventDate = new Date(event.datetime);
  const endDate = new Date(eventDate.getTime() + event.durationMinutes * 60 * 1000);
  const isPast = event.status === 'completed';
  const isFull = event.maxAttendees ? attendeeCount >= event.maxAttendees : false;

  const handleRsvp = async () => {
    if (!user) {
      navigate('/signup?redirect=/events/' + slug + '&action=rsvp');
      return;
    }

    setIsLoading(true);
    try {
      await rsvpToEvent(event.id, user.id);
      setIsRsvpd(true);
      // Refresh attendee count
      const newCount = await getEventAttendeeCount(event.id);
      setAttendeeCount(newCount);
      // Refresh attendees list
      const newAttendees = await getEventAttendees(event.id);
      setAttendees(newAttendees);
      navigate(`/events/${slug}/confirm`);
    } catch (err) {
      console.error('Error RSVPing:', err);
      toast.error('Failed to RSVP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelRsvp = () => {
    setShowCancelRsvpDialog(true);
  };

  const confirmCancelRsvp = async () => {
    if (!user) return;
    setShowCancelRsvpDialog(false);
    setIsLoading(true);
    try {
      await cancelRsvpApi(event.id, user.id);
      setIsRsvpd(false);
      // Refresh attendee count
      const newCount = await getEventAttendeeCount(event.id);
      setAttendeeCount(newCount);
      // Refresh attendees list
      const newAttendees = await getEventAttendees(event.id);
      setAttendees(newAttendees);
      toast.success('RSVP cancelled');
    } catch (err) {
      console.error('Error cancelling RSVP:', err);
      toast.error('Failed to cancel RSVP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEvent = () => {
    setShowCancelEventDialog(true);
  };

  const confirmCancelEvent = async () => {
    setShowCancelEventDialog(false);
    setIsLoading(true);
    try {
      await cancelEventApi(event.id);
      toast.success('Event cancelled');
      navigate('/events');
    } catch (err) {
      console.error('Error cancelling event:', err);
      toast.error('Failed to cancel event. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
          background: `linear-gradient(135deg, ${event.hostAvatarColor || '#3B82F6'}40 0%, ${event.hostAvatarColor || '#3B82F6'}20 100%)`,
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

              {/* Cancelled Banner */}
              {isCancelled && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <Ban className="w-5 h-5 text-red-600" />
                    <div>
                      <p className="font-semibold text-red-800">This event has been cancelled</p>
                      <p className="text-sm text-red-700">The organizer cancelled this event.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Host Controls - right after title for immediate visibility */}
              {isHost && !isPast && !isCancelled && (
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
              {!isPast && !isCancelled && (
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
                      <a
                        href={getOutlookUrl(calendarEventData)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                        onClick={() => setCalendarMenuOpen(false)}
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#0078D4" d="M24 7.387v10.478c0 .23-.08.424-.238.576-.158.154-.352.23-.578.23h-8.547v-6.959l1.6 1.229c.102.086.227.129.376.129.148 0 .273-.043.375-.129l6.774-5.186v-.368c0-.226-.077-.418-.232-.574-.155-.157-.35-.235-.587-.235h-.013l-7.093 5.423-1.2-.919V5.174h8.547c.226 0 .42.076.578.23.158.152.238.346.238.576v1.407zM14.637 5.174v12.155H.792c-.226 0-.42-.076-.578-.23-.158-.152-.237-.346-.237-.576V5.98c0-.23.08-.424.237-.576.159-.154.352-.23.578-.23h13.845zm-7.848 9.142c1.308 0 2.358-.382 3.15-1.145.792-.764 1.188-1.785 1.188-3.063 0-1.258-.393-2.263-1.178-3.016-.786-.752-1.848-1.129-3.188-1.129-1.308 0-2.358.382-3.15 1.145-.792.764-1.188 1.779-1.188 3.045 0 1.279.39 2.29 1.169 3.035.78.746 1.847 1.128 3.197 1.128zm.028-6.621c.706 0 1.257.228 1.654.684.396.456.594 1.099.594 1.929 0 .841-.201 1.496-.603 1.963-.403.468-.951.701-1.645.701-.706 0-1.26-.228-1.663-.684-.403-.456-.604-1.093-.604-1.91 0-.852.198-1.513.594-1.98.397-.469.954-.703 1.673-.703z"/>
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
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#0078D4" d="M21.17 2.06A1.48 1.48 0 0 1 23 3.5v17a1.48 1.48 0 0 1-1.83 1.44l-8.35-2.15a1.49 1.49 0 0 1-1.11-1.44V5.65a1.49 1.49 0 0 1 1.11-1.44l8.35-2.15zM8.33 5.33v13.34H2.67A.67.67 0 0 1 2 18V6a.67.67 0 0 1 .67-.67h5.66zm2.5 1.17v11l7.5 1.93V4.57l-7.5 1.93z"/>
                        </svg>
                        Office 365
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

              {/* RSVP Section - Hidden for host and cancelled events */}
              {!isHost && !isCancelled && (
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
                ) : user ? (
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
                  style={{ backgroundColor: event.hostAvatarColor || '#3B82F6' }}
                >
                  {event.hostName.charAt(0)}
                </div>
                <p className="font-semibold">{event.hostName}</p>
                {event.hostRole && <p className="text-sm text-muted-foreground">{event.hostRole}</p>}
              </Link>
            </div>

            {/* Participants Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4">
                Participants ({attendeeCount}{event.maxAttendees ? `/${event.maxAttendees}` : ''})
              </h2>
              <div className="space-y-2">
                {attendees.map(attendee => (
                  <Link
                    key={attendee.profileId}
                    to={`/p/${attendee.slug}`}
                    className="flex items-center gap-3 w-full p-2 rounded-lg text-left hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                      style={{ backgroundColor: attendee.avatarColor || '#3B82F6' }}
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
                {attendees.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No one has RSVP'd yet. Be the first!
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom padding */}
      <div className="h-12" />

      {/* Cancel RSVP Confirmation Dialog */}
      <Dialog open={showCancelRsvpDialog} onOpenChange={setShowCancelRsvpDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel your RSVP?</DialogTitle>
            <DialogDescription>
              You'll be removed from the guest list for this event.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setShowCancelRsvpDialog(false)}>
              Keep RSVP
            </Button>
            <Button variant="destructive" onClick={confirmCancelRsvp}>
              Cancel RSVP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Event Confirmation Dialog */}
      <Dialog open={showCancelEventDialog} onOpenChange={setShowCancelEventDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel this event?</DialogTitle>
            <DialogDescription>
              All attendees will lose their RSVP. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setShowCancelEventDialog(false)}>
              Keep Event
            </Button>
            <Button variant="destructive" onClick={confirmCancelEvent}>
              Cancel Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
