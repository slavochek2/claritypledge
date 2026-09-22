/**
 * @file video-summaries-service.ts
 * @description P1349: read side of the per-video summary. RLS returns confirmed rows only,
 * so everything here is already public-safe — no status filter is needed client-side, and
 * none is trusted.
 */

import { useEffect, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
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
  return {
    videoId: data.video_id,
    title: data.title,
    channel: data.channel,
    durationSeconds: data.duration_seconds,
    summary: data.summary,
    keyPoints: (data.key_points ?? []).filter((k: unknown) => typeof k === 'string' && k.trim() !== ''),
    moments: cleanMoments(data.moments, data.duration_seconds),
  };
}

/**
 * The DB only checks that moments is an array. Drop anything the page cannot render or seek to
 * (non-integer / negative / past-the-end t, blank or non-string note) rather than crash or seek
 * nowhere, then order by time.
 */
export function cleanMoments(raw: unknown, durationSeconds: number): VideoSummaryMoment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is VideoSummaryMoment =>
        !!m &&
        typeof m === 'object' &&
        Number.isInteger((m as VideoSummaryMoment).t) &&
        (m as VideoSummaryMoment).t >= 0 &&
        (m as VideoSummaryMoment).t <= durationSeconds &&
        typeof (m as VideoSummaryMoment).note === 'string' &&
        (m as VideoSummaryMoment).note.trim() !== '',
    )
    .map((m) => ({ t: m.t, note: m.note }))
    .sort((a, b) => a.t - b.t);
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
 * The set of video ids with a confirmed summary, fetched once and shared by every player on the
 * page — a feed renders dozens of players and must not fire one query each.
 * - Paged: PostgREST caps a response at 1000 rows, so a single select would silently drop links.
 * - Expires after CACHE_MS, so a summary confirmed or withdrawn mid-session is picked up.
 * - On error the set is empty: a missing link is the safe failure, a dead link is not.
 */
const PAGE = 1000;
const CACHE_MS = 5 * 60 * 1000;
let summarisedIds: Promise<Set<string>> | null = null;
let fetchedAt = 0;

export function getSummarisedVideoIds(): Promise<Set<string>> {
  if (summarisedIds && Date.now() - fetchedAt > CACHE_MS) summarisedIds = null;
  if (!summarisedIds) {
    fetchedAt = Date.now();
    summarisedIds = loadSummarisedVideoIds().catch((err: unknown) => {
      // Thrown, not returned (e.g. a network failure inside the client): same safe outcome.
      logDbError('getSummarisedVideoIds', { message: String(err), code: 'THROWN' } as PostgrestError);
      summarisedIds = null;
      return new Set<string>();
    });
  }
  return summarisedIds;
}

async function loadSummarisedVideoIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('video_summaries')
      .select('video_id')
      .eq('provider', 'youtube')
      .order('video_id')
      .range(from, from + PAGE - 1);
    if (error) {
      logDbError('getSummarisedVideoIds', error);
      summarisedIds = null; // retry on the next mount rather than caching the failure
      return new Set<string>();
    }
    (data ?? []).forEach((r) => ids.add(r.video_id as string));
    if (!data || data.length < PAGE) return ids;
  }
}

/** Forget the cached set — the page calls this when a linked summary turns out to be gone. Also a test seam. */
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
