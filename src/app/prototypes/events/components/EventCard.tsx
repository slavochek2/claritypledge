import { Link } from 'react-router-dom';
import { MapPin, Calendar, CheckCircle2 } from 'lucide-react';
import type { MockEvent } from '../mock-data';
import { isUserRsvpd } from '../mock-data';
import { formatDateShort, formatTime } from '../utils';

interface EventCardProps {
  event: MockEvent;
}

export function EventCard({ event }: EventCardProps) {
  const eventDate = new Date(event.datetime);
  const userIsGoing = isUserRsvpd(event.id);

  return (
    <Link
      to={`/prototype/events/${event.slug}`}
      className="group block border border-border rounded-xl overflow-hidden bg-card hover:shadow-lg hover:border-blue-500/50 transition-all duration-200"
    >
      {/* Cover gradient */}
      <div
        className="h-24 relative"
        style={{
          background: `linear-gradient(135deg, ${event.hostAvatarColor}40 0%, ${event.hostAvatarColor}20 100%)`,
        }}
      >
        {/* "You're Going" badge for logged-in RSVP'd user */}
        {userIsGoing && event.status === 'upcoming' && (
          <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            You're Going
          </span>
        )}
      </div>

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

        {/* Host */}
        <p className="text-sm text-muted-foreground mb-2">
          By {event.hostName}
        </p>

        {/* Location */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <MapPin className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{event.location}</span>
        </div>

        {/* Footer: Attendees + Status */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          {/* Attendee avatars */}
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {event.attendees.slice(0, 4).map((attendee, i) => (
                <div
                  key={attendee.id}
                  className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-white"
                  style={{ backgroundColor: attendee.avatarColor, zIndex: 4 - i }}
                >
                  {attendee.name.charAt(0)}
                </div>
              ))}
              {event.attendees.length > 4 && (
                <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                  +{event.attendees.length - 4}
                </div>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {event.attendees.length} {event.status === 'completed' ? 'attended' : 'going'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
