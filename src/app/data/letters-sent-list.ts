/**
 * @file letters-sent-list.ts
 * @description P660/P1545: every sealed letter a person sent, with its source doc title; lenient and strict forms.
 * Re-exported from letters-service.ts, which is the path callers import and tests mock.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import type { ClarityLetter } from '@/app/types';
import { supabase } from '@/lib/supabase';
import { logDbError, throwDbError } from './db-error-logger';
import { requireAuth } from './letters-require-auth';
import { log } from './letters-log';

/**
 * P660 AD5: Get all sealed letters sent by a user (across all docs).
 * Joins clarity_docs to get the source doc title.
 */
export async function getAllSentLetters(senderId: string): Promise<
  Array<ClarityLetter & { doc_title: string }>
> {
  await requireAuth();
  log('getAllSentLetters:', senderId);

  try {
    return await fetchSentLetters(senderId);
  } catch (error) {
    logDbError('getAllSentLetters', error as PostgrestError);
    return [];
  }
}

/** P1545: same read, but a database error rejects instead of reading as "no sent letters". */
export async function getAllSentLettersOrThrow(senderId: string): Promise<
  Array<ClarityLetter & { doc_title: string }>
> {
  await requireAuth();
  log('getAllSentLettersOrThrow:', senderId);
  try {
    return await fetchSentLetters(senderId);
  } catch (error) {
    throwDbError('getAllSentLettersOrThrow', error as PostgrestError, 'Failed to load sent letters');
  }
}

export async function fetchSentLetters(senderId: string): Promise<Array<ClarityLetter & { doc_title: string }>> {
  const { data, error } = await supabase
    .from('clarity_letters')
    .select('*, clarity_docs!inner(title)')
    .eq('sender_id', senderId)
    .eq('status', 'sealed')
    .order('sealed_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    doc_title: (row.clarity_docs as { title: string })?.title ?? 'Untitled',
    clarity_docs: undefined,
  })) as Array<ClarityLetter & { doc_title: string }>;
}
