import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, MapPin } from 'lucide-react';
import { getUpcomingEvents } from '@/app/prototypes/events/mock-data';
import { formatDateShort, formatTime } from '@/app/prototypes/events/utils';

export function UpcomingEventsSection() {
  const upcomingEvents = getUpcomingEvents().slice(0, 3);

  if (upcomingEvents.length === 0) {
    return null;
  }

  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Connect in person
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join community events to meet fellow pledgers, practice clear communication, and build meaningful connections.
          </p>
        </div>

        {/* Events Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto mb-8">
          {upcomingEvents.map((event) => {
            const eventDate = new Date(event.datetime);
            return (
              <Link
                key={event.id}
                to={`/events/${event.slug}`}
                className="group block border border-border rounded-xl overflow-hidden bg-card hover:shadow-lg hover:border-blue-500/50 transition-all duration-200"
              >
                {/* Cover gradient */}
                <div
                  className="h-20 relative"
                  style={{
                    background: `linear-gradient(135deg, ${event.hostAvatarColor}40 0%, ${event.hostAvatarColor}20 100%)`,
                  }}
                />

                {/* Content */}
                <div className="p-4">
                  {/* Time */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDateShort(eventDate)} at {formatTime(eventDate)}</span>
                  </div>

                  {/* Title */}
                  <h3 className="font-semibold text-lg mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {event.title}
                  </h3>

                  {/* Location */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{event.location.split(',')[0]}</span>
                  </div>

                  {/* Attendees count */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {event.attendees.slice(0, 3).map((attendee, i) => (
                          <div
                            key={attendee.id}
                            className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-white"
                            style={{ backgroundColor: attendee.avatarColor, zIndex: 3 - i }}
                          >
                            {attendee.name.charAt(0)}
                          </div>
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {event.attendees.length} going
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            View all events
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
