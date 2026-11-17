/**
 * @file hike-answers-host.ts
 * @description P1675 section 3b: the event host reads the hike answers of the people registered (event_hike_answers, RLS:
 * own row or the event's host). Reading only; the registration RPC is the sole writer. Never throws to the UI.
 */
import { supabase } from '@/lib/supabase';
import { logDbError } from './db-error-logger';
import { isAsked, type HikeHelp, type HikeTransport, type HikeWhen } from './hike-answer-model';

export interface HikeAnswerRow {
  profileId: string;
  when: HikeWhen;
  /** Null when the event did not ask how people are coming (stored NULL). */
  transport: HikeTransport | null;
  freeSeats: number | null;
  help: HikeHelp | null;
  helpOther: string | null;
  /** Whether the event asked the help question when this person registered (stored on the row; absent means asked). */
  askedHelp?: boolean;
}

interface DbRow {
  profile_id: string;
  when_choice: HikeWhen;
  transport: HikeTransport | null;
  free_seats: number | null;
  help: HikeHelp | null;
  help_other: string | null;
  asked_help?: boolean | null;
}

export async function getHikeAnswersForHost(eventId: string): Promise<HikeAnswerRow[]> {
  try {
    const { data, error } = await supabase
      .from('event_hike_answers')
      .select('profile_id, when_choice, transport, free_seats, help, help_other, asked_help')
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
      askedHelp: isAsked(r.asked_help),
    }));
  } catch {
    return [];
  }
}
