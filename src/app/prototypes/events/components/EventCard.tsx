import { Link } from 'react-router-dom';
import { MapPin, Calendar, CheckCircle2, Crown, Ban } from 'lucide-react';
import type { EventWithHost } from '@/app/types';
import { formatDateShort, formatTime } from '../utils';

interface EventCardProps {
  event: EventWithHost;
  isLoggedIn?: boolean;
  userId?: string;  // Pass from parent (EventsList uses useAuth)
  isUserGoing?: boolean;  // RSVP status checked by parent
}

export function EventCard({ event, isLoggedIn = false, userId, isUserGoing = false }: EventCardProps) {
  const eventDate = new Date(event.datetime);
  const userIsHost = isLoggedIn && !!userId && event.hostId === userId;
  const isCancelled = event.status === 'cancelled';

  return (
    <Link
      to={`/events/${event.slug}`}
      className={`group block border border-border rounded-xl overflow-hidden bg-card transition-all duration-200 ${
        isCancelled
          ? 'opacity-60 hover:opacity-80'
          : 'hover:shadow-lg hover:border-blue-500/50'
      }`}
      data-testid="event-card"
    >
      {/* Cover gradient - Mesh style, uses host avatar color for variety */}
      <div
        className="h-24 relative"
        style={{
          background: isCancelled
            ? `radial-gradient(at 0% 0%, #9ca3af40 0%, transparent 50%), radial-gradient(at 100% 100%, #9ca3af30 0%, transparent 50%), linear-gradient(135deg, #9ca3af15 0%, #9ca3af08 100%)`
            : `radial-gradient(at 0% 0%, ${event.hostAvatarColor}50 0%, transparent 50%), radial-gradient(at 100% 100%, ${event.hostAvatarColor}30 0%, transparent 50%), linear-gradient(135deg, ${event.hostAvatarColor}15 0%, ${event.hostAvatarColor}08 100%)`,
        }}
      >
        {/* Status badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {/* Relationship badge - show for both upcoming and cancelled */}
          {userIsHost && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
              isCancelled
                ? 'bg-gray-100 text-gray-600 border border-gray-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              <Crown className="w-3 h-3" />
              {isCancelled ? 'You Were Hosting' : "You're Hosting"}
            </span>
          )}
          {isUserGoing && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
              isCancelled
                ? 'bg-gray-100 text-gray-600 border border-gray-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              <CheckCircle2 className="w-3 h-3" />
              {isCancelled ? 'You Were Going' : "You're Going"}
            </span>
          )}
          {/* Cancelled badge - show below relationship badge */}
          {isCancelled && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
              <Ban className="w-3 h-3" />
              Cancelled
            </span>
          )}
        </div>
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
            {event.attendees && event.attendees.length > 0 && (
              <div className="flex -space-x-2">
                {event.attendees.slice(0, 4).map((attendee, i) => (
                  <div
                    key={attendee.profileId}
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
            )}
            <span className="text-sm text-muted-foreground">
              {event.attendeeCount ?? event.attendees?.length ?? 0} {
                event.status === 'completed' ? 'attended' :
                event.status === 'cancelled' ? 'were going' : 'going'
              }
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
