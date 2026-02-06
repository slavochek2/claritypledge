/**
 * P124: Event Sessions — Shows active/completed /live sessions during an event.
 * Presentational component. Sub-room state is managed by EventDetail.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { eventsService } from '@/app/data/events-service';
import type { EventSubRoomWithProfiles } from '@/app/types';

interface EventSessionsProps {
  subRooms: EventSubRoomWithProfiles[];
  loading: boolean;
  currentUserId: string | undefined;
  eventSlug: string;
}

export function EventSessions({ subRooms, loading, currentUserId, eventSlug }: EventSessionsProps) {
  // Filter out expired pending sub-rooms on the client side
  const visibleRooms = subRooms.filter(room => {
    if (room.status === 'expired' || room.status === 'cancelled') return false;
    if (room.status === 'pending' && new Date(room.expiresAt) < new Date()) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading sessions...
      </div>
    );
  }

  if (visibleRooms.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No sessions yet. Tap someone above to start.
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="Verification sessions" aria-live="polite">
      {visibleRooms.map(room => (
        <SessionRow
          key={room.id}
          room={room}
          currentUserId={currentUserId}
          eventSlug={eventSlug}
        />
      ))}
    </div>
  );
}

function SessionRow({
  room,
  currentUserId,
  eventSlug,
}: {
  room: EventSubRoomWithProfiles;
  currentUserId: string | undefined;
  eventSlug: string;
}) {
  const isInitiator = currentUserId === room.initiatorId;
  const isTarget = currentUserId === room.targetId;
  const isParticipant = isInitiator || isTarget;

  const initiatorLabel = isInitiator ? 'You' : room.initiatorName;
  const targetLabel = isTarget ? 'You' : room.targetName;

  if (room.status === 'pending') {
    return (
      <div
        className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"
        role="listitem"
        aria-label={`${room.initiatorName} waiting for ${room.targetName}`}
      >
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-blue-500" />
          <span className="font-medium">{initiatorLabel} + {targetLabel}</span>
          <span className="text-muted-foreground">
            {isTarget ? '' : `· waiting for ${targetLabel}...`}
          </span>
        </div>
        {isTarget && (
          <JoinButton subRoomId={room.id} eventSlug={eventSlug} />
        )}
        {isInitiator && (
          <CancelButton subRoomId={room.id} />
        )}
      </div>
    );
  }

  if (room.status === 'active') {
    return (
      <div
        className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm"
        role="listitem"
        aria-label={`${room.initiatorName} and ${room.targetName} in session`}
      >
        <Lock className="w-4 h-4 text-blue-600" />
        <span className="font-medium">{initiatorLabel} + {targetLabel}</span>
        <span className="text-blue-600">· in session</span>
        {isParticipant && room.sessionCode && (
          <RejoinButton sessionCode={room.sessionCode} eventSlug={eventSlug} />
        )}
        {isParticipant && !room.sessionCode && (
          <span className="ml-auto">
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
              LIVE
            </span>
          </span>
        )}
      </div>
    );
  }

  if (room.status === 'completed') {
    return (
      <div
        className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm"
        role="listitem"
        aria-label={`${room.initiatorName} and ${room.targetName} verified`}
      >
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        <span className="font-medium">{initiatorLabel} + {targetLabel}</span>
        <span className="text-green-600">· verified</span>
      </div>
    );
  }

  return null;
}

function JoinButton({ subRoomId, eventSlug }: { subRoomId: string; eventSlug: string }) {
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    setJoining(true);
    const result = await eventsService.joinSubRoom(subRoomId);
    if (result) {
      navigate(`/live?code=${result.sessionCode}&returnTo=/events/${eventSlug}`);
    } else {
      toast.error('Could not join session. It may have expired or been cancelled.');
      setJoining(false);
    }
  };

  return (
    <button
      onClick={handleJoin}
      disabled={joining}
      className="px-3 py-1 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50"
      aria-label="Join verification session"
    >
      {joining ? 'Joining...' : 'Join →'}
    </button>
  );
}

function RejoinButton({ sessionCode, eventSlug }: { sessionCode: string; eventSlug: string }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/live?code=${sessionCode}&returnTo=/events/${eventSlug}`)}
      className="ml-auto px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
      aria-label="Rejoin verification session"
    >
      Rejoin →
    </button>
  );
}

function CancelButton({ subRoomId }: { subRoomId: string }) {
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    await eventsService.cancelSubRoom(subRoomId);
    setCancelling(false);
  };

  return (
    <button
      onClick={handleCancel}
      disabled={cancelling}
      className="px-3 py-1 text-sm text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
      aria-label="Cancel session invitation"
    >
      Cancel
    </button>
  );
}

/**
 * Returns the set of profile IDs currently in a non-terminal sub-room
 * (pending or active). Used by EventDetail to gray out occupied participants.
 */
export function getOccupiedProfileIds(subRooms: EventSubRoomWithProfiles[]): Set<string> {
  const occupied = new Set<string>();
  for (const room of subRooms) {
    if (room.status === 'pending' || room.status === 'active') {
      occupied.add(room.initiatorId);
      occupied.add(room.targetId);
    }
  }
  return occupied;
}
