import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const track = vi.fn();
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));

import { useTrackView } from '../use-track-view';

describe('useTrackView', () => {
  beforeEach(() => track.mockClear());

  it('fires once on mount and not on re-render', () => {
    const { rerender } = renderHook(() => useTrackView('feed_viewed'));
    rerender();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('feed_viewed', undefined);
  });

  it('fires once under StrictMode', () => {
    renderHook(() => useTrackView('feed_viewed'), { wrapper: StrictMode });
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('fires again when props change', () => {
    const { rerender } = renderHook(({ s }) => useTrackView('group_viewed', { org_slug: s }), { initialProps: { s: 'a' } });
    rerender({ s: 'a' });
    rerender({ s: 'b' });
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('group_viewed', { org_slug: 'b' });
  });

  it('a new viewKey fires again but is never sent', () => {
    const { rerender } = renderHook(({ k }) => useTrackView('chat_opened', undefined, true, k), { initialProps: { k: 'conv-a' } });
    rerender({ k: 'conv-a' });
    rerender({ k: 'conv-b' });
    expect(track).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(track.mock.calls)).not.toContain('conv-');
  });

  it('does not fire when disabled, fires once enabled', () => {
    const { rerender } = renderHook(({ e }) => useTrackView('x', undefined, e), { initialProps: { e: false } });
    expect(track).not.toHaveBeenCalled();
    rerender({ e: true });
    expect(track).toHaveBeenCalledTimes(1);
  });
});
