/**
 * @file group-by-source.ts
 * @description P1296 item 7 — gather the stories built on one video into one group.
 *
 * WHAT A SOURCE IS. One video, keyed `provider:videoId` by `parseVideoUrl`. Every URL form of
 * the same video (`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`, with or without
 * `&t=`) is therefore ONE source — the raw URL string is never the key. Adding a source type
 * means extending `parseVideoUrl` and its host allowlist; grouping follows with no change here.
 *
 * WHAT GETS GROUPED. Exactly the list the page is rendering, after its own filters. This is a
 * pure function over that list and never fetches, so a search that narrows the list regroups
 * it on the next render with nothing else to keep in sync.
 *
 * WHERE A GROUP SITS. At its FIRST story's position in the list as given; the source's later
 * stories join it there. Nothing is re-sorted by date or author — but the list IS reordered
 * around each group, and that cost was accepted with the founder's choice of grouping over
 * collapsing (spec, History §b).
 *
 * WHAT IS NEVER GROUPED. A story whose video URL does not parse, a story with only an image,
 * a story with no media — and a source with only ONE story in the list, which renders as a
 * plain card: a tray around a single card says "group" where there is nothing to group.
 */
import { parseVideoUrl } from '@/lib/video';

export type SourceListEntry<T> =
  | { kind: 'single'; key: string; story: T }
  | { kind: 'group'; key: string; sourceKey: string; stories: T[] };

/** `provider:videoId`, or null when the story has no parseable video. */
export function sourceKeyFor(videoUrl: string | null | undefined): string | null {
  const video = parseVideoUrl(videoUrl);
  return video ? `${video.provider}:${video.videoId}` : null;
}

/**
 * Keys are stable across regroups: a group is keyed by its SOURCE, so a group that survives
 * a search keeps its mounted player; a single is keyed by its story id.
 */
export function groupBySource<T extends { id: string; videoUrl?: string | null }>(
  stories: readonly T[],
): SourceListEntry<T>[] {
  const keys = stories.map((story) => sourceKeyFor(story.videoUrl));

  const members = new Map<string, T[]>();
  stories.forEach((story, i) => {
    const key = keys[i];
    if (!key) return;
    const bucket = members.get(key);
    if (bucket) bucket.push(story);
    else members.set(key, [story]);
  });

  const placed = new Set<string>();
  const entries: SourceListEntry<T>[] = [];
  stories.forEach((story, i) => {
    const key = keys[i];
    const bucket = key ? members.get(key) : undefined;
    if (!key || !bucket || bucket.length < 2) {
      entries.push({ kind: 'single', key: `story:${story.id}`, story });
      return;
    }
    if (placed.has(key)) return;
    placed.add(key);
    entries.push({ kind: 'group', key: `source:${key}`, sourceKey: key, stories: bucket });
  });
  return entries;
}
