/**
 * @file my-registration-answers.ts
 * @description P1529 UAT round 1: the person's own registration answers for a flow that asks (their role, and whether they come at the
 * doors time). Read through the table's own-row policy; nothing else of the answers is read here.
 */
import { supabase } from '@/lib/supabase';
import type { ObserverPrep, Participation } from './registration-answer-model';

export interface MyRole {
  participation: Participation;
  observerPrep: ObserverPrep | null;
}

/** Null when the person has no answers (no registration in a flow that asks). A failed read throws: it must not read as "no answers". */
export async function getMyRegistrationRole(eventId: string, profileId: string): Promise<MyRole | null> {
  const { data, error } = await supabase
    .from('event_registration_answers')
    .select('participation, observer_prep')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { participation: data.participation as Participation, observerPrep: (data.observer_prep as ObserverPrep | null) ?? null };
}
