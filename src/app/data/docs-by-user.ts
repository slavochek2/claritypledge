/**
 * @file docs-by-user.ts
 * @description The owner's draft list (docsService.getDocsByUser / getDocsByUserOrThrow) and the doc row mapper
 * docs-service shares. One helper per side query, each filling its field on the docs it is given.
 */
import type { PostgrestError } from '@supabase/postgrest-js';
import { supabase } from '@/lib/supabase';
import { logDbError, throwDbError } from './db-error-logger';
import type { ClarityDoc, DbClarityDoc } from '@/app/types';

const DEBUG = import.meta.env.DEV;
// eslint-disable-next-line no-console -- gated by DEBUG (import.meta.env.DEV); dev-only diagnostic (P1200)
const log = (...args: unknown[]) => DEBUG && console.log('[docs-service]', ...args);

/**
 * Transform DB doc row to ClarityDoc. story_count comes from a computed column
 * or must be set by the caller. has_sent_letters defaults to false; caller
 * overwrites after the clarity_letters check in getDocsByUser.
 */
export function mapDocFromDb(row: DbClarityDoc & { story_count?: number }): ClarityDoc {
  return {
    id: row.id,
    owner_id: row.owner_id,
    title: row.title,
    visibility: row.visibility,
    created_at: row.created_at,
    updated_at: row.updated_at,
    story_count: row.story_count ?? 0,
    point_count: 0,
    has_sent_letters: false,
  };
}

type SideResult<T> = { data: T[] | null; error: PostgrestError | null };
type PointRow = { doc_id: string; story: { story_points: Array<{ point_id: string }> } | null };

/** Stories per doc, counted from the doc_stories rows. Left as mapped when the query failed. */
function applyStoryCounts(docs: ClarityDoc[], result: SideResult<{ doc_id: string }>): void {
  if (result.error || !result.data) return;
  const counts: Record<string, number> = {};
  for (const row of result.data) {
    counts[row.doc_id] = (counts[row.doc_id] || 0) + 1;
  }
  for (const doc of docs) {
    doc.story_count = counts[doc.id] || 0;
  }
}

/** Unique points per doc, flattened from each story's points. Left as mapped when the query failed. */
function applyPointCounts(docs: ClarityDoc[], result: SideResult<unknown>): void {
  if (result.error || !result.data) return;
  const pointCounts: Record<string, Set<string>> = {};
  for (const row of result.data as PointRow[]) {
    const docPoints = pointCounts[row.doc_id] ?? (pointCounts[row.doc_id] = new Set());
    const storyPoints = row.story?.story_points ?? [];
    for (const sp of storyPoints) {
      docPoints.add(sp.point_id);
    }
  }
  for (const doc of docs) {
    doc.point_count = pointCounts[doc.id]?.size ?? 0;
  }
}

/** Whether letters were sent from each doc (the Delete guard). */
function applySentLetters(docs: ClarityDoc[], result: SideResult<{ source_doc_id: string | null }>): void {
  if (result.error) {
    // Query failed — default conservatively: block deletion on all docs
    // to prevent the UI guard from being bypassed. Server-side check in
    // deleteDoc() is the defense-in-depth layer.
    logDbError('getDocsByUser:sentLetters', result.error);
    for (const doc of docs) {
      doc.has_sent_letters = true;
    }
  } else if (result.data) {
    const sentDocIds = new Set(result.data.map((l) => l.source_doc_id));
    for (const doc of docs) {
      doc.has_sent_letters = sentDocIds.has(doc.id);
    }
  }
}

/** Story counts, point counts and the sent-letters guard for the given docs, filled in place. */
async function enrichDocs(docs: ClarityDoc[], strict: boolean): Promise<void> {
  const docIds = docs.map((d) => d.id);

  const [countResult, pointResult, sentResult] = await Promise.all([
    supabase.from('doc_stories').select('doc_id').in('doc_id', docIds),
    supabase
      .from('doc_stories')
      .select('doc_id, story:stories!inner(story_points(point_id))')
      .in('doc_id', docIds),
    supabase
      .from('clarity_letters')
      .select('source_doc_id')
      .in('source_doc_id', docIds)
      .neq('status', 'draft'),
  ]);

  // Strict readers (P1545 Artifacts) must not show wrong counts: a failed side query is a failed read.
  if (strict) {
    const sideError = countResult.error ?? pointResult.error;
    if (sideError) throwDbError('getDocsByUserOrThrow', sideError, 'Failed to load drafts');
  }

  applyStoryCounts(docs, countResult);
  applyPointCounts(docs, pointResult);
  applySentLetters(docs, sentResult);
}

export async function fetchDocsByUser(userId: string, strict: boolean): Promise<ClarityDoc[]> {
  log('getDocsByUser:', userId);

  const { data, error } = await supabase
    .from('clarity_docs')
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    if (strict) throwDbError('getDocsByUserOrThrow', error, 'Failed to load drafts');
    logDbError('getDocsByUser', error);
    return [];
  }

  // Count stories per doc separately to avoid nested select issues
  const docs = (data ?? []).map((row: unknown) => mapDocFromDb(row as DbClarityDoc));

  if (docs.length > 0) {
    await enrichDocs(docs, strict);
  }

  return docs;
}
