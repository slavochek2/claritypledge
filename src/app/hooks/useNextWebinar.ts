import { useState, useEffect } from "react";
import { eventsService } from "@/app/data/events-service";
import { getNextUpcomingWebinar } from "@/app/data/webinar-series";
import type { EventWithHost } from "@/app/types";

/**
 * Single source of truth for "is there a next Clarity Experiment to join?" (P969).
 *
 * The landing hero (program-page), the route-aware nav CTA (simple-navigation), and any
 * other public surface read from here so they cannot disagree mid-load: one shared
 * getUpcomingEvents call, one `nextEvent` result. Previously the hero fetched on its own
 * while the nav rendered a hardcoded label — so during any no-event window the hero said
 * "Try a Clarity Letter" while the header still promised the experiment.
 *
 * The fetch is memoized at module scope so the first consumer to mount triggers the network
 * call and every later consumer reuses the same promise — no duplicate request when the
 * landing renders both the hero and the nav. A failed fetch clears the cache so the next
 * mount can retry.
 */
let cachedUpcoming: Promise<EventWithHost[]> | null = null;

function fetchUpcomingOnce(): Promise<EventWithHost[]> {
  if (!cachedUpcoming) {
    cachedUpcoming = eventsService.getUpcomingEvents().catch((err) => {
      cachedUpcoming = null; // allow retry after a transient failure
      throw err;
    });
  }
  return cachedUpcoming;
}

/**
 * Test-only: clear the module-level fetch cache so each test starts fresh. Without this,
 * the first test in a file to mount a consumer caches its mocked result, and later tests
 * in the same file silently reuse it instead of their own mock. Call in `beforeEach`.
 */
export function __resetNextWebinarCacheForTest(): void {
  cachedUpcoming = null;
}

export interface NextWebinarState {
  /** The next upcoming Lost Co-Founders webinar, or null when none exists / still loading. */
  nextEvent: EventWithHost | null;
  /** True until the shared fetch resolves. Consumers default to the no-event surface while loading. */
  loading: boolean;
}

export function useNextWebinar(): NextWebinarState {
  const [nextEvent, setNextEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchUpcomingOnce()
      .then((events) => {
        if (!active) return;
        setNextEvent(getNextUpcomingWebinar(events));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setNextEvent(null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { nextEvent, loading };
}
