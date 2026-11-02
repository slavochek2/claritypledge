/**
 * @file EventRoomLink.tsx
 * @description A way back to the event room from an event's chat: shown in the channel header and the thread header, on
 * desktop and phones (founder, solo test 2026-11-02). Nothing for any other kind of chat.
 */
import { Link } from 'react-router-dom';
import { DoorOpen } from 'lucide-react';
import type { ChatSummary } from '@/app/data/chat-service';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER } from './chat-kit';

export function EventRoomLink({ chat }: { chat: ChatSummary }) {
  if (chat.kind !== 'event' || !chat.event) return null;
  return (
    <Link
      to={`/events/${chat.event.slug}/room`}
      data-testid="event-room-link"
      className={cn('flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-blue-700', HOVER, FOCUS_RING)}
    >
      <DoorOpen className="h-4 w-4" aria-hidden="true" />
      Event room
    </Link>
  );
}
