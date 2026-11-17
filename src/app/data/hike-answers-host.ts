/**
 * @file hike-answers-host.ts
 * @description P1675 section 3b: the event host reads the hike answers of the people registered (event_hike_answers, RLS:
 * own row or the event's host). Reading only; the registration RPC is the sole writer. Never throws to the UI.
 */
import { supabase } from '@/lib/supabase';
import { logDbError } from './db-error-logger';
import type { HikeHelp, HikeTransport, HikeWhen } from './hike-answer-model';

export interface HikeAnswerRow {
  profileId: string;
  when: HikeWhen;
  transport: HikeTransport;
  freeSeats: number | null;
  help: HikeHelp | null;
  helpOther: string | null;
}

interface DbRow {
  profile_id: string;
  when_choice: HikeWhen;
  transport: HikeTransport;
  free_seats: number | null;
  help: HikeHelp | null;
  help_other: string | null;
}

export async function getHikeAnswersForHost(eventId: string): Promise<HikeAnswerRow[]> {
  try {
    const { data, error } = await supabase
      .from('event_hike_answers')
      .select('profile_id, when_choice, transport, free_seats, help, help_other')
      .eq('event_id', eventId);
    if (error) {
      logDbError('getHikeAnswersForHost', error, { eventId });
      return [];
    }
    return ((data ?? []) as DbRow[]).map((r) => ({
      profileId: r.profile_id,
      when: r.when_choice,
      transport: r.transport,
      freeSeats: r.free_seats,
      help: r.help,
      helpOther: r.help_other,
    }));
  } catch {
    return [];
  }
}
