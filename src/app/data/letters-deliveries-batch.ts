/**
 * @file letters-deliveries-batch.ts
 * @description P692/P1545: every delivery of several letters in one read, keyed by letter; lenient (logs, reads as empty) and strict (rejects) forms.
 * Re-exported from letters-service.ts, which is the path callers import and tests mock.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import type { LetterDelivery } from '@/app/types';
import { supabase } from '@/lib/supabase';
import { logDbError, throwDbError } from './db-error-logger';
import { requireAuth } from './letters-require-auth';
import { log } from './letters-log';

/**
 * P692: Batch fetch deliveries for multiple letters in one query.
 * Replaces N individual getDeliveriesForLetter() calls in SentTab.
 * Returns a map keyed by letter_id; missing letters get an empty array.
 */
export async function getDeliveriesForLetters(
  letterIds: string[]
): Promise<Record<string, LetterDelivery[]>> {
  if (letterIds.length === 0) return {};
  await requireAuth();
  log('getDeliveriesForLetters:', letterIds.length, 'letters');

  try {
    return await fetchDeliveriesGrouped(letterIds);
  } catch (error) {
    logDbError('getDeliveriesForLetters', error as PostgrestError);
    return Object.fromEntries(letterIds.map((id) => [id, []]));
  }
}

/**
 * P1545: same read, but a database error rejects instead of reading as "no recipients". The Artifacts
 * page uses it so a failed read never replaces what it already shows, and never offers Delete letter
 * for a letter whose recipients are unknown.
 */
export async function getDeliveriesForLettersOrThrow(
  letterIds: string[]
): Promise<Record<string, LetterDelivery[]>> {
  if (letterIds.length === 0) return {};
  await requireAuth();
  log('getDeliveriesForLettersOrThrow:', letterIds.length, 'letters');
  try {
    return await fetchDeliveriesGrouped(letterIds);
  } catch (error) {
    throwDbError('getDeliveriesForLettersOrThrow', error as PostgrestError, 'Failed to load deliveries');
  }
}

export async function fetchDeliveriesGrouped(letterIds: string[]): Promise<Record<string, LetterDelivery[]>> {
  // P699 Phase 2: use get_deliveries_with_progress to include steps_completed + total_steps
  const { data, error } = await supabase
    .rpc('get_deliveries_with_progress', { p_letter_ids: letterIds });
  if (error) throw error;

  const deliveries = (data ?? []) as LetterDelivery[];
  const grouped: Record<string, LetterDelivery[]> = Object.fromEntries(
    letterIds.map((id) => [id, []])
  );
  for (const delivery of deliveries) {
    grouped[delivery.letter_id]?.push(delivery);
  }
  return grouped;
}
