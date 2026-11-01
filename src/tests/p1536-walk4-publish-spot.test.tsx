/**
 * @file p1536-walk4-publish-spot.test.tsx
 * @description P1536 walkthrough 4, item 5: the Publish spot does not flash at a run's end. (a) `useSettledRun` holds from the SAME commit in which the run
 * went off: its hold is set in a layout effect, so the state flushes before the browser paints (a passive effect would let one frame show the run-off
 * state). (b) During a run the spot says Updating even while the page's read is out (`ready` null), instead of going blank.
 * jsdom has no paint: (a) is observed in the task that committed the run-off render, before any passive effect ran. The browser walk proves the pixels.
 */
import { createRoot } from 'react-dom/client';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { emitCanvasDraftEvent } from '@/app/data/canvas-draft-events';
import { useSettledRun } from '@/app/pages/canvas/use-settled-run';
import { publishSpotState } from '@/app/components/canvas/canvas-publish-spot-state';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const READ = { read: 1 };

const seen: string[] = [];
function Probe({ runActive }: { runActive: boolean }) {
  const held = useSettledRun(runActive, READ);
  // Declared after the hook, so it runs after the hook's own layout effect in the same commit. The microtask runs when the task that committed ends:
  // after the layout-effect update flushed, before any passive effect of a default-priority render.
  useLayoutEffect(() => {
    if (!runActive) queueMicrotask(() => seen.push(document.querySelector('output')?.textContent ?? 'none'));
  });
  return <output>{String(held)}</output>;
}

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  root?.unmount();
  root = null;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  seen.length = 0;
});

describe('5a: the hold starts in the commit where the run went off', () => {
  it('after a run with an "updated" event, the first run-off commit already reads held (before any passive effect)', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(<Probe runActive />);
    await wait(30);
    emitCanvasDraftEvent({ kind: 'updated', draftId: 'd1' });
    root.render(<Probe runActive={false} />);
    await wait(30);
    expect(seen[0]).toBe('true');
    host.remove();
  });
});

describe('5b: the spot says Updating through a run even while the page read is out', () => {
  it('ready null + run active: updating (not loading); ready null + no run: still loading', () => {
    expect(publishSpotState(null, true)).toEqual({ kind: 'updating' });
    expect(publishSpotState(null, false)).toEqual({ kind: 'loading' });
  });
  it('CONTROL: a read in hand and a run active is updating as before', () => {
    expect(publishSpotState({ isOwner: true, draft: null, publishedNone: false, versions: [], points: [], version: null } as unknown as CanvasReady, true)).toEqual({ kind: 'updating' });
  });
});
