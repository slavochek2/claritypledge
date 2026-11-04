/**
 * @file chat-seat-query.ts
 * @description P1604: the one query "does this person have a seat in any transcription room of this chat?". No imports of the app's
 * client, so the integration spec can run THIS exact builder against the real PostgREST (the embed is hinted by foreign-key name:
 * transcribe_room_members has two keys to transcribe_rooms, and an un-hinted embed is refused as ambiguous).
 */
interface SeatQuery {
  eq: (column: string, value: string) => SeatQuery;
  or: (filter: string, options: { referencedTable: string }) => SeatQuery;
  limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}
interface SeatClient {
  from: (table: 'transcribe_room_members') => { select: (columns: string) => SeatQuery };
}

/** A room of this chat: by its conversation, or (an event chat) by its event: the same match as get_chat_transcription_processing. */
export function seatInChatQuery(client: unknown, conversationId: string, profileId: string, eventId: string | null = null) {
  const rooms = eventId
    ? `conversation_id.eq.${conversationId},event_id.eq.${eventId}`
    : `conversation_id.eq.${conversationId}`;
  return (client as SeatClient)
    .from('transcribe_room_members')
    .select('id, transcribe_rooms!transcribe_room_members_room_id_fkey!inner(conversation_id, event_id)')
    .eq('profile_id', profileId)
    .or(rooms, { referencedTable: 'transcribe_rooms' })
    .limit(1);
}
