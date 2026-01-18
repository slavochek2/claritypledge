import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Calendar, CheckCircle2, Crown, Ban } from 'lucide-react';
import type { EventWithHost, EventAttendee } from '@/app/types';
import { isUserRsvpd, getEventAttendees } from '@/app/data/api';
import { formatDateShort, formatTime } from '../utils';

interface EventCardProps {
  event: EventWithHost;
  currentUserId?: string;
}

export function EventCard({ event, currentUserId }: EventCardProps) {
  const [userIsGoing, setUserIsGoing] = useState(false);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);

  const eventDate = new Date(event.datetime);
  const userIsHost = currentUserId && event.hostId === currentUserId;
  const isCancelled = event.status === 'cancelled';

  useEffect(() => {
    async function loadData() {
      // Load attendees
      const eventAttendees = await getEventAttendees(event.id);
      setAttendees(eventAttendees);

      // Check if current user is RSVP'd (only if logged in and not host)
      if (currentUserId && !userIsHost) {
        const isGoing = await isUserRsvpd(event.id, currentUserId);
        setUserIsGoing(isGoing);
      }
    }
    loadData();
  }, [event.id, currentUserId, userIsHost]);

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
      {/* Cover gradient */}
      <div
        className={`h-24 relative ${isCancelled ? 'grayscale' : ''}`}
        style={{
          background: `linear-gradient(135deg, ${event.hostAvatarColor || '#3B82F6'}40 0%, ${event.hostAvatarColor || '#3B82F6'}20 100%)`,
        }}
      >
        {/* Status badge */}
        {isCancelled && (
          <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
            <Ban className="w-3 h-3" />
            Cancelled
          </span>
        )}
        {event.status === 'upcoming' && userIsHost && (
          <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
            <Crown className="w-3 h-3" />
            You're Hosting
          </span>
        )}
        {event.status === 'upcoming' && userIsGoing && !userIsHost && (
          <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
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
              {attendees.slice(0, 4).map((attendee, i) => (
                <div
                  key={attendee.profileId}
                  className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-white"
                  style={{ backgroundColor: attendee.avatarColor || '#3B82F6', zIndex: 4 - i }}
                >
                  {attendee.name.charAt(0)}
                </div>
              ))}
              {attendees.length > 4 && (
                <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                  +{attendees.length - 4}
                </div>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {attendees.length} {event.status === 'completed' ? 'attended' : 'going'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
