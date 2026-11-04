/**
 * P1604: the query behind countActiveRooms, in one importable place so an integration test runs the EXACT shape through the
 * real PostgREST (mocks hid this once: the consent_carried_from_room_id foreign key made the plain `transcribe_rooms!inner`
 * embed ambiguous (PGRST201), the count failed closed, and every live slice came back 429).
 *
 * transcribe_room_members has TWO foreign keys to transcribe_rooms (room_id, consent_carried_from_room_id), so the embed MUST
 * name the one it means. The embed keeps the name `transcribe_rooms`, which is what the filters below address.
 */

export const ACTIVE_ROOMS_EMBED =
  'transcribe_rooms!transcribe_room_members_room_id_fkey!inner(ended_at, created_at)';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

/** This member's seats whose capture and room are both still open and whose room is younger than the cap. */
export function activeRoomsQuery(client: Client, userId: string, cutoffIso: string) {
  return client
    .from('transcribe_room_members')
    // !inner so the filter on the joined room actually restricts the member rows;
    // a plain embed would return every membership with a null room and count them all.
    .select(`id, ${ACTIVE_ROOMS_EMBED}`, { count: 'exact', head: true })
    .eq('profile_id', userId)
    .is('capture_ended_at', null)
    .is('transcribe_rooms.ended_at', null)
    .gt('transcribe_rooms.created_at', cutoffIso);
}
