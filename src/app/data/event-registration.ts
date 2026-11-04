/**
 * @file event-registration.ts
 * @description P1529 D16: registering for a flow that asks questions before the seat. The server takes the answers
 * and the seat in one transaction (register_for_event), and refuses a seat without them on every other path.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { invokeEventEmails } from '@/lib/event-emails';
import { guardSeatWrite, isAnonymousRlsDenial, SessionMismatchError } from '@/lib/session-guard';
import { logDbError } from './db-error-logger';

export type Participation = 'canvas_before' | 'canvas_at_doors' | 'observer';
export type PhoneKind = 'usbc' | 'lightning' | 'other';

export interface RegistrationAnswers {
  participation: Participation;
  phone: PhoneKind;
  hope: string;
  recordingAccepted: true;
}

export type RegisterResult = 'ok' | 'already' | 'full' | 'cancelled' | 'not_found' | 'failed';

export async function registerForEvent(
  event: { id: string; slug: string },
  profileId: string,
  answers: RegistrationAnswers,
): Promise<RegisterResult> {
  if (!(await guardSeatWrite(profileId))) return 'failed';
  let result;
  try {
    result = await supabase.rpc('register_for_event', {
      p_slug: event.slug,
      p_participation: answers.participation,
      p_phone: answers.phone,
      p_hope: answers.hope,
      p_recording_accepted: answers.recordingAccepted,
    });
  } finally {
    clearListReturnCache(); // admission to a canvas follows the RSVP row
  }
  const { data, error, status } = result;
  if (isAnonymousRlsDenial(error, status)) throw new SessionMismatchError(profileId);
  if (error) {
    logDbError('registerForEvent', error);
    return 'failed';
  }
  if (data === 'ok') invokeEventEmails('rsvp', event.id, profileId);
  return data as RegisterResult;
}
