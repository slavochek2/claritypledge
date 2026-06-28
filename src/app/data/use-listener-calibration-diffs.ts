/**
 * P967: Hook and pure helpers for the Listening Calibration Breakdown page.
 *
 * Data source: get_my_listener_calibration_diffs() SECURITY DEFINER RPC.
 * Never calls getListenerVerificationHistory() — that path has a cross-user RLS leak.
 *
 * Sign invariant: diff = speaker_rating − listener_rating (actual − self).
 * This matches the displayed bar sign (profile-page-v2.tsx negates calibrationGap
 * from calibration-service-real.ts:174 which stores self − actual).
 * AVG(diff) over eligible rows = displayed bar value.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface CalibrationDiffRow {
  id: string;
  story_id: string;
  listener_rating: number | null;
  speaker_rating: number | null;
  speaker_name: string;
  speaker_slug: string;
  story_title: string;
  created_at: string;
  sort_order: number | null;
}

export interface CalibrationFooter {
  sum: number;
  count: number;
  avg: number;
}

/** A row is eligible when both ratings are non-null. */
export function isEligible(row: Pick<CalibrationDiffRow, 'speaker_rating' | 'listener_rating'>): boolean {
  return row.speaker_rating !== null && row.listener_rating !== null;
}

/**
 * Compute col3 = speaker_rating − listener_rating (actual − self).
 * Returns null for ineligible rows (null ratings).
 */
export function computeDiff(row: Pick<CalibrationDiffRow, 'speaker_rating' | 'listener_rating'>): number | null {
  if (!isEligible(row)) return null;
  return (row.speaker_rating as number) - (row.listener_rating as number);
}

/**
 * Compute the footer totals over eligible rows only.
 * Returns null when no eligible rows exist (avoids division by zero / NaN).
 */
export function computeFooter(rows: Pick<CalibrationDiffRow, 'speaker_rating' | 'listener_rating'>[]): CalibrationFooter | null {
  const eligible = rows.filter(isEligible);
  if (eligible.length === 0) return null;
  const sum = eligible.reduce((acc, r) => acc + ((r.speaker_rating as number) - (r.listener_rating as number)), 0);
  return { sum, count: eligible.length, avg: sum / eligible.length };
}

export type CalibrationState = 'loading' | 'empty' | 'pre-unlock' | 'unlocked';

const UNLOCK_THRESHOLD = 5;

export interface UseListenerCalibrationDiffsResult {
  rows: CalibrationDiffRow[];
  state: CalibrationState;
  footer: CalibrationFooter | null;
  isLoading: boolean;
  error: string | null;
}

export function useListenerCalibrationDiffs(): UseListenerCalibrationDiffsResult {
  const [rows, setRows] = useState<CalibrationDiffRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    supabase
      .rpc('get_my_listener_calibration_diffs')
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) {
          setError(rpcError.message);
        } else {
          setRows((data as CalibrationDiffRow[]) ?? []);
        }
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const eligibleCount = rows.filter(isEligible).length;
  let state: CalibrationState = 'loading';
  if (!isLoading) {
    if (eligibleCount === 0) state = 'empty';
    else if (eligibleCount < UNLOCK_THRESHOLD) state = 'pre-unlock';
    else state = 'unlocked';
  }

  const footer = isLoading ? null : computeFooter(rows);

  return { rows, state, footer, isLoading, error };
}
