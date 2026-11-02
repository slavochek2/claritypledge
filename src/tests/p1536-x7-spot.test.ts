/**
 * @file p1536-x7-spot.test.ts
 * @description P1536 3c X7 (S3c.4): before there is anything to publish, the spot says so. Publish shows only when the draft has points AND (it has no
 * base, or it differs from its base). Everything else in the spot is a status: never a disabled button, never empty. The old texts are gone.
 */
import { describe, expect, it } from 'vitest';
import { publishSpotState, stateAfterRefusal, statusText } from '@/app/components/canvas/canvas-publish-spot-state';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const pt = (box: string) => ({ id: `p-${box}`, systemTags: [box] });
const draftReady = (over: { points?: unknown[]; baseSeq?: number | null; changedBoxes?: string[]; publishedNone?: boolean }): CanvasReady => ({
  isOwner: true, version: 'd', publishedNone: over.publishedNone ?? false, points: over.points ?? [pt('canvas:problem')],
  versions: [{ name: 'd', draft: true, seq: null }], draft: { version: 'd', baseSeq: over.baseSeq === undefined ? 1 : over.baseSeq, changedBoxes: over.changedBoxes ?? [] },
}) as unknown as CanvasReady;
const publishedReady = { isOwner: true, version: 'v1', publishedNone: false, points: [pt('canvas:problem')], versions: [{ name: 'v1', draft: false, seq: 1 }], draft: null } as unknown as CanvasReady;

describe('X7: when Publish shows', () => {
  it('points and a difference from the base: Publish', () => {
    expect(publishSpotState(draftReady({ changedBoxes: ['canvas:problem'] }), false)).toEqual({ kind: 'publish' });
  });
  it('a first draft (no base) with points: Publish', () => {
    expect(publishSpotState(draftReady({ baseSeq: null, publishedNone: true }), false)).toEqual({ kind: 'publish' });
  });
  it('all points removed from a draft with a base: "nothing", even though boxes differ', () => {
    expect(publishSpotState(draftReady({ points: [], changedBoxes: ['canvas:problem'] }), false)).toEqual({ kind: 'nothing' });
  });
  it('points but no difference from the base: nothing', () => {
    expect(publishSpotState(draftReady({ changedBoxes: [] }), false)).toEqual({ kind: 'nothing' });
  });
  it('a first draft with no points: nothing', () => {
    expect(publishSpotState(draftReady({ baseSeq: null, points: [], publishedNone: true }), false)).toEqual({ kind: 'nothing' });
  });
  it('a pending Clone: nothing', () => {
    expect(publishSpotState(publishedReady, false, true)).toEqual({ kind: 'nothing' });
  });
  it('a run active on THIS draft: updating; another draft\'s run is not an input here, so Publish shows (draft A while a run is active on draft B)', () => {
    expect(publishSpotState(draftReady({ changedBoxes: ['canvas:problem'] }), true)).toEqual({ kind: 'updating' });
    expect(publishSpotState(draftReady({ changedBoxes: ['canvas:problem'] }), false)).toEqual({ kind: 'publish' });
  });
  it('the cap and a failed newest run are not inputs: with a difference, Publish still shows', () => {
    const ready = draftReady({ changedBoxes: ['canvas:problem'] });
    (ready.draft as { runCount: number }).runCount = 30;
    expect(publishSpotState(ready, false)).toEqual({ kind: 'publish' });
  });
  it('the server\'s refusals return the spot to "nothing", whichever of them it is', () => {
    expect(stateAfterRefusal('no_changes')).toEqual({ kind: 'nothing' });
    expect(stateAfterRefusal('draft_empty')).toEqual({ kind: 'nothing' });
    expect(stateAfterRefusal('stale_view')).toBe('reread');
    expect(stateAfterRefusal('busy_elsewhere')).toBe('reread');
    expect(stateAfterRefusal('anything_else')).toBe('unknown');
  });
});

describe('X7: the words of the spot', () => {
  it('Nothing to publish yet, Updating…, Publishing…; the button states have no text; the old texts are gone', () => {
    expect(statusText({ kind: 'nothing' }, false)).toBe('Nothing to publish yet');
    expect(statusText({ kind: 'updating' }, false)).toBe('Updating…');
    expect(statusText({ kind: 'publish' }, true)).toBe('Publishing…');
    expect(statusText({ kind: 'publish' }, false)).toBeNull();
    expect(statusText({ kind: 'loading' }, false)).toBeNull();
    const all = [{ kind: 'nothing' }, { kind: 'updating' }, { kind: 'publish' }, { kind: 'loading' }] as const;
    for (const s of all) for (const text of [statusText(s, false), statusText(s, true)]) {
      expect(text ?? '').not.toMatch(/No changes yet|Not published yet|Published ·|Nothing published yet|from v/);
    }
  });
});
