/**
 * P406: Practice Rooms — Event-Native Session Start
 *
 * Renders an open-room discovery section on the event detail page.
 * Polls for active rooms every 5s. Allows participants to signal
 * readiness and join each other without out-of-band link exchange.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventsService } from '@/app/data/events-service';
import { createClaritySession } from '@/app/data/api';
import type { EventPracticeRoom } from '@/app/types';
import { PersonAvatar } from '@/components/ui/person-avatar';

const POLL_INTERVAL_MS = 5000;

interface PracticeRoomsProps {
  eventId: string;
  eventSlug: string;
  /** null if unauthenticated */
  currentUserId: string | null;
  /** Display name for createClaritySession — null if unauthenticated */
  currentUserName: string | null;
}

export function PracticeRooms({ eventId, eventSlug, currentUserId, currentUserName }: PracticeRoomsProps) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<EventPracticeRoom[]>([]);
  const [isOpening, setIsOpening] = useState(false);
  const leavingRef = useRef<Set<string>>(new Set());

  const myRoom = rooms.find(r => r.creatorId === currentUserId && r.status === 'waiting');
  const hasMyRoom = !!myRoom;

  // ── Polling ──────────────────────────────────────────────────────────────────

  async function fetchRooms() {
    try {
      const data = await eventsService.getPracticeRooms(eventId);
      setRooms(data);
    } catch {
      // On error: show empty (keeps [+ Open a room] enabled per spec)
      setRooms([]);
    }
  }

  useEffect(() => {
    fetchRooms();
    const id = setInterval(fetchRooms, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleOpenRoom() {
    if (!currentUserId || !currentUserName) {
      navigate('/login');
      return;
    }
    if (hasMyRoom) return;

    setIsOpening(true);
    try {
      const session = await createClaritySession(currentUserName, currentUserId);
      await eventsService.openPracticeRoom(eventId, currentUserId, session.id, session.code);
      navigate(`/live/${session.code}?returnTo=${encodeURIComponent(`/events/${eventSlug}`)}&insights=off`);
    } catch (err) {
      console.error('[PracticeRooms] Failed to open room:', err);
      setIsOpening(false);
    }
  }

  async function handleLeave(room: EventPracticeRoom) {
    // Optimistic update
    setRooms(prev => prev.filter(r => r.id !== room.id));
    leavingRef.current.add(room.id);

    try {
      await eventsService.closePracticeRoom(room.id);
    } catch (err) {
      console.error('[PracticeRooms] Failed to close room:', err);
      // Re-fetch to restore actual state
      fetchRooms();
    } finally {
      leavingRef.current.delete(room.id);
    }
  }

  function handleJoin(room: EventPracticeRoom) {
    if (!room.sessionCode) return;
    navigate(`/live/${room.sessionCode}?returnTo=${encodeURIComponent(`/events/${eventSlug}`)}`);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const openButtonDisabled = hasMyRoom || isOpening;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm text-muted-foreground">Clarity Practice Rooms</h2>
        <button
          onClick={handleOpenRoom}
          disabled={openButtonDisabled}
          aria-disabled={openButtonDisabled}
          className={[
            'text-sm font-medium px-3 py-1.5 rounded-lg transition-colors',
            openButtonDisabled
              ? 'text-muted-foreground/50 bg-muted/30 cursor-not-allowed'
              : 'text-blue-600 bg-blue-50 hover:bg-blue-100',
          ].join(' ')}
        >
          + Open a room
        </button>
      </div>

      {/* Room list */}
      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open rooms yet. Be the first!</p>
      ) : (
        <ul className="space-y-2" aria-live="polite">
          {rooms.map(room => (
            <RoomRow
              key={room.id}
              room={room}
              isMyRoom={room.creatorId === currentUserId}
              onJoin={() => handleJoin(room)}
              onLeave={() => handleLeave(room)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── RoomRow ───────────────────────────────────────────────────────────────────

interface RoomRowProps {
  room: EventPracticeRoom;
  isMyRoom: boolean;
  onJoin: () => void;
  onLeave: () => void;
}

function RoomRow({ room, isMyRoom, onJoin, onLeave }: RoomRowProps) {
  const isActive = room.status === 'active';
  const displayName = isMyRoom ? 'You' : room.creatorName;

  return (
    <li
      className={[
        'flex items-center gap-3 py-2',
        isActive ? 'opacity-60' : '',
      ].join(' ')}
      aria-label={
        isActive
          ? `${room.creatorName} in session`
          : isMyRoom
          ? 'You · waiting...'
          : `${room.creatorName} · waiting...`
      }
    >
      {/* Avatar */}
      <PersonAvatar
        person={{
          name: room.creatorName,
          slug: room.creatorSlug,
          avatarColor: room.creatorAvatarColor,
          avatarUrl: room.creatorAvatarUrl,
          hasPledged: false,
        }}
        size="sm"
      />

      {/* Name + status */}
      <span className="flex-1 text-sm">
        <span className="font-medium">{displayName}</span>
        <span className="text-muted-foreground">
          {isActive ? ' · in session' : ' · waiting...'}
        </span>
      </span>

      {/* Action */}
      {isActive ? (
        <span
          className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"
          aria-hidden="true"
        />
      ) : isMyRoom ? (
        <button
          onClick={onLeave}
          className="text-xs text-muted-foreground hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
        >
          Leave
        </button>
      ) : (
        <button
          onClick={onJoin}
          disabled={!room.sessionCode}
          aria-label={`Join ${room.creatorName}'s room`}
          className={[
            'text-xs font-medium px-2 py-1 rounded transition-colors',
            room.sessionCode
              ? 'text-blue-600 hover:bg-blue-50'
              : 'text-muted-foreground/50 cursor-not-allowed',
          ].join(' ')}
        >
          Join →
        </button>
      )}
    </li>
  );
}
