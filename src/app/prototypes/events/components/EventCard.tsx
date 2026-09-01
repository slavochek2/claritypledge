import { Link } from 'react-router-dom';
import { MapPin, Video, Calendar, CheckCircle2, Crown, Ban } from 'lucide-react';
import type { EventWithHost, PersonRef } from '@/app/types';
import { formatDateShort, formatTime } from '../utils';
import { classifyLocation, getLocationDisplayLabel } from '../location-utils';
import { PersonAvatar } from '@/components/ui/person-avatar';

interface EventCardProps {
  event: EventWithHost;
  isLoggedIn?: boolean;
  userId?: string;  // Pass from parent (EventsList uses useAuth)
  isUserGoing?: boolean;  // RSVP status checked by parent
  linkPrefix?: string;  // Override link base (e.g., '/prototype/events-mock')
}

export function EventCard({ event, isLoggedIn = false, userId, isUserGoing = false, linkPrefix = '/events' }: EventCardProps) {
  const eventDate = new Date(event.datetime);
  const userIsHost = isLoggedIn && !!userId && event.hostId === userId;
  const isCancelled = event.status === 'cancelled';
  const locInfo = classifyLocation(event.location);

  return (
    <Link
      to={`${linkPrefix}/${event.slug}`}
      className={`group block rounded-xl overflow-hidden bg-card transition-all duration-200 border-l-4 border border-border ${
        isCancelled
          ? 'opacity-60 hover:opacity-80 border-l-gray-400'
          : 'hover:shadow-lg hover:border-blue-300 border-l-blue-500'
      }`}
      data-testid="event-card"
    >
      {/* Banner image - 16:9, only when bannerUrl is set */}
      {event.bannerUrl && (
        <div className="w-full aspect-video overflow-hidden">
          <img
            src={event.bannerUrl}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}

      {/* Status badges row */}
      {(userIsHost || isUserGoing || isCancelled) && (
        <div className="px-4 pt-3 flex flex-wrap gap-1">
          {/* Relationship badge - show for both upcoming and cancelled */}
          {userIsHost && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
              isCancelled
                ? 'bg-gray-100 text-gray-600 border border-border'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              <Crown className="w-3 h-3" />
              {isCancelled ? 'You Were Hosting' : "You're Hosting"}
            </span>
          )}
          {isUserGoing && !userIsHost && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
              isCancelled
                ? 'bg-gray-100 text-gray-600 border border-border'
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
      )}

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
          {locInfo.type === 'virtual'
            ? <Video className="w-4 h-4 flex-shrink-0" />
            : <MapPin className="w-4 h-4 flex-shrink-0" />
          }
          <span className="truncate">{getLocationDisplayLabel(locInfo, event.location)}</span>
        </div>

        {/* Footer: Attendees + Status */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          {/* Attendee avatars */}
          <div className="flex items-center gap-2">
            {event.attendees && event.attendees.length > 0 && (
              <div className="flex -space-x-2">
                {event.attendees.slice(0, 4).map((attendee, i) => (
                  <div key={attendee.profileId} style={{ zIndex: 4 - i }} className="relative">
                    <PersonAvatar
                      person={{
                        name: attendee.name,
                        slug: attendee.slug,
                        avatarColor: attendee.avatarColor,
                        avatarUrl: attendee.avatarUrl,
                        hasPledged: attendee.hasPledged,
                      } satisfies PersonRef}
                      size="sm"
                      className="w-7 h-7 border-2 border-white"
                    />
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
                event.status === 'completed' || new Date(event.datetime) < new Date() ? 'attended' :
                event.status === 'cancelled' ? 'were going' : 'going'
              }
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
