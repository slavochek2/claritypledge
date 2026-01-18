import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Calendar, MapPin, ArrowRight, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEventBySlug, type EventWithHost } from '@/app/data/api';
import { formatDate, formatTime, downloadICSFile } from '../utils';

const AUTO_REDIRECT_DELAY_MS = 10000; // 10 seconds

export function RsvpConfirm() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch event data
  useEffect(() => {
    async function loadEvent() {
      if (!slug) return;

      setLoading(true);
      try {
        const eventData = await getEventBySlug(slug);
        setEvent(eventData);
      } catch (err) {
        console.error('Error loading event:', err);
      } finally {
        setLoading(false);
      }
    }

    loadEvent();
  }, [slug]);

  // Auto-redirect to event page after confirmation
  useEffect(() => {
    if (!event) return;

    const timer = setTimeout(() => {
      navigate(`/events/${slug}`);
    }, AUTO_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [navigate, slug, event]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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

  const eventDate = new Date(event.datetime);
  const endDate = new Date(eventDate.getTime() + event.durationMinutes * 60 * 1000);

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
                <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <p>{event.location}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={() => downloadICSFile(calendarEventData)}
              variant="outline"
              className="w-full gap-2"
            >
              <Download className="w-4 h-4" />
              Add to Calendar
            </Button>

            <Link to={`/events/${slug}`} className="block">
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
