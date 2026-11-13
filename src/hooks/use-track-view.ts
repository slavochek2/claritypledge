/**
 * @file use-track-view.ts
 * @description P1669: fire one named analytics event per view. Keyed on event + serialized props,
 * so StrictMode double-mounts and re-renders fire once, a changed value (another group slug)
 * fires again, and going `enabled=false` then true again counts as a new view.
 * Props must be public values only (slugs): no ids from private surfaces, tokens or query strings.
 */
import { useEffect, useRef } from 'react';
import { analytics } from '@/lib/mixpanel';

export function useTrackView(
  event: string,
  props?: Record<string, unknown>,
  enabled = true,
  /** Marks a new view without being sent (e.g. a conversation id, which must never reach analytics). */
  viewKey?: string,
) {
  const lastKey = useRef<string | null>(null);
  const key = `${event}:${props ? JSON.stringify(props) : ''}:${viewKey ?? ''}`;
  useEffect(() => {
    if (!enabled) {
      lastKey.current = null;
      return;
    }
    if (lastKey.current === key) return;
    lastKey.current = key;
    analytics.track(event, props);
    // props are captured by `key`; depending on the object would refire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
}
