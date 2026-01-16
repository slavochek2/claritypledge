import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Calendar, MapPin, ArrowRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEventBySlug } from '../mock-data';

export function RsvpConfirm() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const event = slug ? getEventBySlug(slug) : undefined;

  // Auto-redirect after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(`/prototype/events/${slug}`);
    }, 10000);

    return () => clearTimeout(timer);
  }, [navigate, slug]);

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

  // Generate ICS file content
  const generateICS = () => {
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
                <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <p>{event.location}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={generateICS}
              variant="outline"
              className="w-full gap-2"
            >
              <Download className="w-4 h-4" />
              Add to Calendar
            </Button>

            <Link to={`/prototype/events/${slug}`} className="block">
              <Button variant="ghost" className="w-full gap-2">
                View Event Details
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {/* Auto-redirect notice */}
          <p className="text-xs text-muted-foreground mt-6">
            Redirecting to event page in a few seconds...
          </p>
        </div>

        {/* Back to events link */}
        <div className="text-center mt-6">
          <Link
            to="/prototype/events"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Browse more events
          </Link>
        </div>
      </div>
    </div>
  );
}
