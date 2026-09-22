/**
 * @file video-summaries-service.ts
 * @description P1349: read side of the per-video summary. RLS returns confirmed rows only,
 * so everything here is already public-safe — no status filter is needed client-side, and
 * none is trusted.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logDbError, throwDbError } from './db-error-logger';

export interface VideoSummaryMoment {
  /** Seconds from the start of the video. */
  t: number;
  note: string;
}

export interface VideoSummary {
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  summary: string;
  keyPoints: string[];
  moments: VideoSummaryMoment[];
}

export function videoSummaryPath(videoId: string): string {
  return `/video/${encodeURIComponent(videoId)}`;
}

export async function getVideoSummary(videoId: string): Promise<VideoSummary | null> {
  const { data, error } = await supabase
    .from('video_summaries')
    .select('video_id, title, channel, duration_seconds, summary, key_points, moments')
    .eq('provider', 'youtube')
    .eq('video_id', videoId)
    .maybeSingle();
  if (error) throwDbError('getVideoSummary', error, 'Could not load the video summary');
  if (!data) return null;
  const moments = Array.isArray(data.moments) ? (data.moments as VideoSummaryMoment[]) : [];
  return {
    videoId: data.video_id,
    title: data.title,
    channel: data.channel,
    durationSeconds: data.duration_seconds,
    summary: data.summary,
    keyPoints: data.key_points ?? [],
    moments: [...moments].sort((a, b) => a.t - b.t),
  };
}

/** Prose paragraphs, with generator markdown emphasis (*x*) reduced to plain text. */
export function summaryParagraphs(summary: string): string[] {
  return summary
    .split(/\n\n+/)
    .map((p) => p.trim().replace(/\*([^*]+)\*/g, '$1'))
    .filter(Boolean);
}

export function readMinutes(summary: string): number {
  return Math.max(1, Math.round(summary.split(/\s+/).filter(Boolean).length / 200));
}

/**
 * The set of video ids with a confirmed summary, fetched once per page load and shared by every
 * player on the page — a feed renders dozens of players and must not fire one query each.
 * On error the set is empty: a missing link is the safe failure, a dead link is not.
 */
let summarisedIds: Promise<Set<string>> | null = null;

export function getSummarisedVideoIds(): Promise<Set<string>> {
  if (!summarisedIds) {
    summarisedIds = (async () => {
      const { data, error } = await supabase
        .from('video_summaries')
        .select('video_id')
        .eq('provider', 'youtube');
      if (error) {
        logDbError('getSummarisedVideoIds', error);
        summarisedIds = null; // retry on the next mount rather than caching the failure
        return new Set<string>();
      }
      return new Set((data ?? []).map((r) => r.video_id as string));
    })();
  }
  return summarisedIds;
}

/** Test seam: forget the cached set. */
export function resetSummarisedVideoIdsCache(): void {
  summarisedIds = null;
}

/** True once we know this video has a confirmed summary; false while loading or when it has none. */
export function useHasVideoSummary(videoId: string | null | undefined): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!videoId) {
      setHas(false);
      return;
    }
    let live = true;
    getSummarisedVideoIds().then((ids) => {
      if (live) setHas(ids.has(videoId));
    });
    return () => {
      live = false;
    };
  }, [videoId]);
  return has;
}
