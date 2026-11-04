/**
 * @file transcript-speakers.ts
 * @description P1604: who spoke in a room, as the chat shows people. A seat (member id) maps to a profile (name, slug, face, pledger
 * ring) read the same way the chat reads its authors; a seat whose account was erased is "deleted"; a profile that could not be read
 * is "unknown". Both reads are member-scoped by RLS. A failed read is "nothing known": the text still shows, with plain labels.
 */
import { supabase } from '@/lib/supabase';
import { getChatAuthors, type ChatAuthor } from '@/app/data/chat-ui-helpers';

export type SpeakerPerson = { kind: 'person'; author: ChatAuthor } | { kind: 'deleted' } | { kind: 'unknown' };

export async function fetchSpeakerPeople(roomId: string): Promise<Map<string, SpeakerPerson>> {
  const out = new Map<string, SpeakerPerson>();
  try {
    const { data, error } = await supabase.from('transcribe_room_members').select('id, profile_id').eq('room_id', roomId);
    if (error) throw new Error(error.message);
    const seats = (data ?? []) as Array<{ id: string; profile_id: string | null }>;
    const authors = new Map((await getChatAuthors(seats.flatMap((s) => (s.profile_id ? [s.profile_id] : [])))).map((a) => [a.id, a]));
    for (const s of seats) {
      if (!s.profile_id) out.set(s.id, { kind: 'deleted' });
      else {
        const author = authors.get(s.profile_id);
        out.set(s.id, author ? { kind: 'person', author } : { kind: 'unknown' });
      }
    }
  } catch (err) {
    console.warn('[sessions] speakers could not be read, showing plain names:', err);
    out.clear();
  }
  return out;
}
