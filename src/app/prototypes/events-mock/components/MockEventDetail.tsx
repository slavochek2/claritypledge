import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, MapPin, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEventsService } from '../index';
import { formatTime, getTimezoneLabel } from '@/app/prototypes/events/utils';
import type { EventWithHost } from '@/app/types';

export function MockEventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const eventsService = useEventsService();

  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvent() {
      if (!slug) {
        setLoading(false);
        return;
      }
      const eventData = await eventsService.getEventBySlug(slug);
      setEvent(eventData);
      setLoading(false);
    }
    fetchEvent();
  }, [slug, eventsService]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
          <p className="text-muted-foreground mb-4">This mock event doesn't exist.</p>
          <Link to="/prototype/events-mock/list">
            <Button variant="outline">Back to Events</Button>
          </Link>
        </div>
      </div>
    );
  }

  const eventDate = new Date(event.datetime);
  const endDate = new Date(eventDate.getTime() + event.durationMinutes * 60 * 1000);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header Gradient */}
      <div
        className="w-full h-32 md:h-48"
        style={{
          background: `radial-gradient(at 0% 0%, ${event.hostAvatarColor}50 0%, transparent 50%), radial-gradient(at 100% 100%, ${event.hostAvatarColor}30 0%, transparent 50%), linear-gradient(135deg, ${event.hostAvatarColor}15 0%, ${event.hostAvatarColor}08 100%)`,
        }}
      />

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link
          to="/prototype/events-mock/list"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Mock Events
        </Link>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column - Event Details */}
          <div className="flex-1">
            <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
              {/* Mock data notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-amber-800">
                  This is mock data — no real database calls
                </p>
              </div>

              <h1 className="text-2xl md:text-3xl font-bold mb-4">{event.title}</h1>

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

              {/* Location */}
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 mb-6 text-muted-foreground hover:text-blue-600 transition-colors group"
              >
                <MapPin className="w-5 h-5" />
                <span className="group-hover:underline">{event.location}</span>
              </a>

              {/* Description */}
              <div className="prose prose-sm max-w-none text-muted-foreground mb-6 pt-4 border-t border-border">
                <ReactMarkdown>{event.description}</ReactMarkdown>
              </div>

              {/* Disabled RSVP button (mock) */}
              <Button disabled className="w-full" size="lg">
                RSVP Disabled (Mock Mode)
              </Button>
            </div>
          </div>

          {/* Right Column - Organizer & Participants */}
          <div className="lg:w-96 lg:flex-shrink-0 space-y-6">
            {/* Organizer Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4">Event Organizer</h2>
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white font-semibold text-xl mb-2"
                  style={{ backgroundColor: event.hostAvatarColor }}
                >
                  {event.hostName.charAt(0)}
                </div>
                <p className="font-semibold">{event.hostName}</p>
                <p className="text-sm text-muted-foreground">{event.hostRole}</p>
              </div>
            </div>

            {/* Participants Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4">
                Participants ({(event.attendees ?? []).length}{event.maxAttendees ? `/${event.maxAttendees}` : ''})
              </h2>
              <div className="space-y-3">
                {(event.attendees ?? []).map(attendee => (
                  <div key={attendee.profileId} className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                      style={{ backgroundColor: attendee.avatarColor }}
                    >
                      {attendee.name.charAt(0)}
                    </div>
                    <span className="font-medium">{attendee.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
