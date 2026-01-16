import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft,
  MapPin,
  Users,
  CheckCircle2,
  CalendarPlus,
  X,
  ChevronDown,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEventBySlug, mockCurrentUser, isUserRsvpd } from '../mock-data';

export function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const event = slug ? getEventBySlug(slug) : undefined;

  // Check if user is already RSVP'd (from mock data)
  const alreadyRsvpd = event ? isUserRsvpd(event.id) : false;

  // Local state for new RSVPs during this session
  const [justRsvpd, setJustRsvpd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const calendarMenuRef = useRef<HTMLDivElement>(null);

  const isRsvpd = alreadyRsvpd || justRsvpd;

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

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
          <p className="text-muted-foreground mb-4">This event doesn't exist or has been removed.</p>
          <Link to="/prototype/events">
            <Button variant="outline">Back to Events</Button>
          </Link>
        </div>
      </div>
    );
  }

  const eventDate = new Date(event.datetime);
  const endDate = new Date(eventDate.getTime() + event.durationHours * 60 * 60 * 1000);
  const isPast = event.status === 'completed';

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleRsvp = async () => {
    if (!mockCurrentUser.isLoggedIn) {
      navigate('/sign-pledge?redirect=/prototype/events/' + slug);
      return;
    }

    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setJustRsvpd(true);
    setIsLoading(false);
    navigate(`/prototype/events/${slug}/confirm`);
  };

  const handleCancelRsvp = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setJustRsvpd(false);
    // In real app, would also update backend
    setIsLoading(false);
  };

  // Generate ICS file
  const handleAddToCalendar = () => {
    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Clarity Pledge//Events//EN
BEGIN:VEVENT
UID:${event.id}@claritypledge.com
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(eventDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${event.title}
DESCRIPTION:${event.description.replace(/\n/g, '\\n').substring(0, 200)}
LOCATION:${event.location}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.slug}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate Google Calendar URL
  const getGoogleCalendarUrl = () => {
    const formatGoogleDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${formatGoogleDate(eventDate)}/${formatGoogleDate(endDate)}`,
      details: event.description.substring(0, 500),
      location: event.location,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate('/prototype/events')}
            className="p-2 -ml-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold truncate flex-1">Event Details</h1>
        </div>
      </div>

      {/* Cover Image or Gradient */}
      {event.coverImageUrl ? (
        <div className="w-full h-48 md:h-64 overflow-hidden">
          <img
            src={event.coverImageUrl}
            alt={event.title}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div
          className="w-full h-32 md:h-48"
          style={{
            background: `linear-gradient(135deg, ${event.hostAvatarColor}40 0%, ${event.hostAvatarColor}20 100%)`,
          }}
        />
      )}

      {/* Content - Two column layout on desktop */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column - Event Details */}
          <div className="flex-1">
            <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
              {/* Title */}
              <h1 className="text-2xl md:text-3xl font-bold mb-4">{event.title}</h1>

              {/* Date & Time */}
              <div className="flex items-center gap-3 mb-3 text-muted-foreground">
                <CalendarPlus className="w-5 h-5" />
                <div>
                  <span className="font-medium text-foreground">
                    {eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="mx-2">·</span>
                  <span>{formatTime(eventDate)} - {formatTime(endDate)}</span>
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
                        href={getGoogleCalendarUrl()}
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
                          handleAddToCalendar();
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

              {/* RSVP Section */}
              <div>
                {isPast ? (
                  <Button disabled className="w-full" size="lg">
                    Event Ended
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
                      disabled={isLoading || alreadyRsvpd}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                ) : mockCurrentUser.isLoggedIn ? (
                  <Button
                    onClick={handleRsvp}
                    className="w-full"
                    size="lg"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Registering...' : 'RSVP'}
                  </Button>
                ) : (
                  <Button onClick={handleRsvp} className="w-full" size="lg">
                    Sign Up to RSVP
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Organizer & Participants */}
          <div className="lg:w-80 lg:flex-shrink-0 space-y-6">
            {/* Organizer Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4">Event Organizer</h2>

              <button
                className="flex flex-col items-center text-center w-full hover:bg-muted rounded-lg p-3 -m-3 transition-colors group"
                onClick={() => {
                  // TODO: Navigate to organizer profile
                  console.log('View organizer profile:', event.hostId);
                }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white font-semibold text-xl mb-2"
                  style={{ backgroundColor: event.hostAvatarColor }}
                >
                  {event.hostName.charAt(0)}
                </div>
                <p className="font-semibold group-hover:text-blue-600 transition-colors">{event.hostName}</p>
                <p className="text-sm text-muted-foreground">{event.hostRole}</p>
              </button>
            </div>

            {/* Participants Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4">
                Participants ({event.attendees.length})
              </h2>
              <div className="space-y-2">
                {event.attendees.map(attendee => (
                  <button
                    key={attendee.id}
                    className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors text-left group"
                    onClick={() => {
                      // TODO: Navigate to profile when implemented
                      console.log('View profile:', attendee.id);
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                      style={{ backgroundColor: attendee.avatarColor }}
                    >
                      {attendee.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-blue-600 transition-colors">
                        {attendee.name}
                      </p>
                    </div>
                    <span className="text-xs text-green-600 font-medium">
                      {isPast ? 'Attended' : 'Going'}
                    </span>
                  </button>
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
