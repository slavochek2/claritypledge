/**
 * @file use-shared-point-stories.ts
 * @description P1631: the stories linked to a published point, read with the same service call the feed and the canvas use (getStoriesForPoints).
 * Row security decides what comes back: the viewer's own stories, and the stories written on a card this viewer can read (migration 20261113200000).
 * Cards rendered in the same tick share ONE call (a microtask batcher), so a chat of many cards costs one read, not one per card.
 * `stories` is undefined until the read settles and stays undefined when it FAILS: the card then shows neither a story row nor "Add a story",
 * never a false "0 stories". Nothing is read when `enabled` is false.
 */
import { useCallback, useEffect, useState } from 'react';
import { storiesService } from '@/app/data/stories-service';
import type { StoryWithAuthor } from '@/app/types';

type Waiter = { resolve: (stories: StoryWithAuthor[]) => void; reject: (e: unknown) => void };
let pending = new Map<string, Waiter[]>();

/** Queues one point id; every id queued before the microtask runs goes out in a single getStoriesForPoints call. Exported for tests. */
export function loadStoriesBatched(pointId: string): Promise<StoryWithAuthor[]> {
  return new Promise((resolve, reject) => {
    const first = pending.size === 0;
    pending.set(pointId, [...(pending.get(pointId) ?? []), { resolve, reject }]);
    if (first) queueMicrotask(flush);
  });
}

function flush(): void {
  const batch = pending;
  pending = new Map(); // cleared before the call: a card that asks while it is in flight starts the next batch
  // strict: a failed read rejects instead of returning an empty map, so the card can tell "failed" from "none"
  storiesService.getStoriesForPoints([...batch.keys()], undefined, { strict: true }).then(
    (map) => batch.forEach((waiters, id) => waiters.forEach((w) => w.resolve(map.get(id) ?? []))),
    (e) => batch.forEach((waiters) => waiters.forEach((w) => w.reject(e))),
  );
}

export function useSharedPointStories(pointId: string, enabled: boolean): { stories: StoryWithAuthor[] | undefined; failed: boolean; reload: () => void } {
  const [stories, setStories] = useState<StoryWithAuthor[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setStories(undefined);
      setFailed(false);
      return;
    }
    let live = true;
    setFailed(false);
    loadStoriesBatched(pointId).then(
      (rows) => { if (live) setStories(rows); },
      () => { if (live) { setStories(undefined); setFailed(true); } },
    );
    return () => { live = false; };
  }, [pointId, enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { stories, failed, reload };
}
