/**
 * @file offline-strip-episodes.ts
 * @description P1677: one analytics event per offline-strip EPISODE, the span from the strip
 * appearing until it leaves the screen. Measurement only: nothing here changes what the strip
 * shows or when.
 *
 * The episode follows the strip's STATE, never its text (the saved-copy text changes age every
 * minute). Routes are reduced to a known top-level segment, never sent raw.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics } from '@/lib/mixpanel';
import { STRIP_OFFLINE_TEXT, STRIP_SLOW_TEXT, stripCachedText } from '@/app/contexts/offline-status-context';

export const STRIP_EPISODE_EVENT = 'offline_strip_episode';
/** At most this many episodes are sent per document load (module-level, so navigation keeps it). */
export const MAX_EPISODES_PER_LOAD = 5;

export type StripState = 'slow' | 'offline_cached' | 'offline';
export type EpisodeEnd = 'cleared' | 'unmount';

/** Every first path segment the app's top-level routes use. A test checks it against src/App.tsx. */
export const KNOWN_TOP_LEVEL_SEGMENTS: readonly string[] = [
  'about', 'admin', 'agreements', 'article', 'artifacts', 'auth', 'blog-subscribed', 'builders', 'chat', 'chats',
  'clarity-champions', 'clarity-chat', 'clarity-demo', 'cm', 'co-create', 'coach', 'compare', 'create', 'd', 'demo',
  'docs', 'donate', 'events', 'explain-back', 'feed', 'founder', 'groups', 'hiring', 'home', 'intro', 'letter',
  'letters', 'live', 'login', 'machines', 'manifesto', 'me', 'meet', 'org', 'p', 'pledgers', 'point', 'prepare',
  'pricing', 'privacy-policy', 'ready', 's', 'sessions', 'settings', 'sign-pledge', 'signup', 'stake', 'story',
  'terms-of-service', 'topics', 'transcribe', 'understanding-champions', 'video',
  // Declared outside App.tsx: src/app/routes/code-routes.tsx, template-routes.tsx, use-case-landings.ts.
  'connect', 'partner-template', 'hospitals', 'communities', 'change-managers',
];

const CACHED_PREFIX = stripCachedText('just now');

/** Strip text to state. The saved-copy age part is never compared. */
export function stripStateFromText(text: string | null): StripState | null {
  if (!text) return null;
  if (text === STRIP_SLOW_TEXT) return 'slow';
  if (text === STRIP_OFFLINE_TEXT) return 'offline';
  if (text.startsWith(CACHED_PREFIX)) return 'offline_cached';
  return null;
}

/** First path segment if it is a known top-level route, `/` for the root, else `other`. */
export function reduceRoute(pathname: string): string {
  const segment = pathname.split('/')[1] ?? '';
  if (segment === '') return '/';
  return KNOWN_TOP_LEVEL_SEGMENTS.includes(segment) ? `/${segment}` : 'other';
}

type EpisodeProps = Record<string, string | number | boolean>;

let sentThisLoad = 0;
/** Events that ended while the tab was hidden; sent when it is next visible (metered-services rule 3). */
let hiddenQueue: EpisodeProps[] = [];
let visibilityListenerAdded = false;

/** Test-only. */
export function _resetEpisodeCountForTesting(): void {
  sentThisLoad = 0;
  hiddenQueue = [];
}

interface Episode {
  firstState: StripState;
  lastState: StripState;
  startedAt: number;
  startRoute: string;
}

/** Called by OfflineStrip before its early return, with the strip's current text. */
export function useOfflineStripEpisode(text: string | null): void {
  const state = stripStateFromText(text);
  const route = reduceRoute(useLocation().pathname);
  const episode = useRef<Episode | null>(null);
  const routeRef = useRef(route);

  useEffect(() => {
    routeRef.current = route;
  });

  useEffect(() => {
    const current = episode.current;
    if (state && !current) {
      episode.current = { firstState: state, lastState: state, startedAt: Date.now(), startRoute: routeRef.current };
    } else if (state && current) {
      current.lastState = state;
    } else if (!state && current) {
      episode.current = null;
      sendEpisode(current, 'cleared', routeRef.current);
    }
  }, [state]);

  useEffect(
    () => () => {
      const current = episode.current;
      if (!current) return;
      episode.current = null;
      sendEpisode(current, 'unmount', routeRef.current);
    },
    [],
  );
}

function flushWhenVisible(): void {
  if (document.visibilityState !== 'visible') return;
  const queued = hiddenQueue;
  hiddenQueue = [];
  for (const props of queued) analytics.track(STRIP_EPISODE_EVENT, props);
}

function sendEpisode(episode: Episode, endedBy: EpisodeEnd, endRoute: string): void {
  if (sentThisLoad >= MAX_EPISODES_PER_LOAD) return;
  sentThisLoad += 1;
  const props: EpisodeProps = {
    first_state: episode.firstState,
    last_state: episode.lastState,
    duration_ms: Date.now() - episode.startedAt,
    ended_by: endedBy,
    start_route: episode.startRoute,
    end_route: endRoute,
    navigator_online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    hiddenQueue.push(props);
    if (!visibilityListenerAdded) {
      visibilityListenerAdded = true;
      document.addEventListener('visibilitychange', flushWhenVisible);
    }
    return;
  }
  analytics.track(STRIP_EPISODE_EVENT, props);
}
