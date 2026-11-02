/**
 * @file event-chat-path.ts
 * @description P1596: the route of an event's table chat, linked from the room page. Clean text is posted into
 * the event channel (P1592), in the round-table thread. Currently seated in an open round: that round's thread. Not seated (or no thread yet): the event
 * channel. The route shapes are the chat router's (`/chats/c/:conversationId[/t/:rootId]`).
 */
// The wording lives in capture-copy.ts (the info icon reads it too, without pulling the chat service in).
export { EVENT_TEXT_ARRIVES, EVENT_TEXT_ARRIVES_SHORT } from '@/app/components/session/capture-copy';

import { getMyChats } from './chat-service';
import { getMyOpenRoundSeat, type OpenRoundSeat } from './chat-round-threads';

/**
 * Seated in the open round with its thread: that thread. Open round, no thread yet or not seated: the channel
 * (never an older round's thread while a round is on). No round open (between rounds, after the last): the
 * viewer's newest round thread, else the channel.
 */
export function eventChatPath(conversationId: string, seat: OpenRoundSeat | null): string {
  const channel = `/chats/c/${conversationId}`;
  if (!seat) return channel;
  if (seat.roundOpen === false) {
    return seat.latestRootMessageId ? `${channel}/t/${seat.latestRootMessageId}` : channel;
  }
  return seat.rootMessageId ? `${channel}/t/${seat.rootMessageId}` : channel;
}

/** null when the viewer has no readable channel for this event; the caller falls back to the room page. */
export async function resolveEventChatPath(eventId: string): Promise<string | null> {
  const chats = await getMyChats();
  const channel = chats.find((c) => c.kind === 'event' && c.event?.id === eventId);
  if (!channel) return null;
  const seat = await getMyOpenRoundSeat(channel.conversationId).catch(() => null);
  return eventChatPath(channel.conversationId, seat);
}

/**
 * "Open" on the capture bar: the room page, where the live text arrives seconds after it is said (founder, solo
 * test 2026-11-02). The table's chat stays empty until the next round starts, so opening it first reads as broken.
 * The room page links on to the chat. Capture keeps running either way (it belongs to the provider, not to a page).
 */
export function openCapturedRoom(capture: { roomCode?: string | null }, navigate: (to: string) => void): void {
  if (capture.roomCode) navigate(`/transcribe/${capture.roomCode}`);
}
