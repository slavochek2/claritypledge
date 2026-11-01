/**
 * @file p1536-walk4-bare-ws.test.tsx
 * @description P1536 walkthrough 4, item 7: a bare `?ws=1` with a published version and an open draft lands on the draft even though the page has already
 * adopted the newest published version into the address (so the read the hook sees is for `?v=<published>`). An explicit `?v=<published>&ws=1` that
 * never was bare stays on the published view; a read for another address never fires; a version picked afterwards is never dragged back.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { useBareWorkspaceDraft } from '@/app/pages/canvas/use-bare-workspace-draft';

const PUBLISHED = 'canvas_d111111';
const DRAFT = 'canvas_dabc123';
const readOf = (version: string, over: Partial<{ draft: object | null; isOwner: boolean }> = {}) =>
  ({ isOwner: true, version, draft: { version: DRAFT }, ...over }) as unknown as CanvasReady;
const search = (q: string) => new URLSearchParams(q);

interface Props { params: URLSearchParams; reported: { ready: CanvasReady | null; forVersion: string | null } }
function mount(initial: Props, openDraft = vi.fn()) {
  const hook = renderHook((p: Props) => useBareWorkspaceDraft({ eligible: true, params: p.params, reported: p.reported, pendingClone: false, openDraft }), { initialProps: initial });
  return { ...hook, openDraft };
}

describe('7: the address arrived bare', () => {
  it('bare, then the page adopts ?v=<published> with a read for it: the draft is opened, once', () => {
    const { rerender, openDraft } = mount({ params: search('ws=1'), reported: { ready: null, forVersion: null } });
    rerender({ params: search(`ws=1&v=${PUBLISHED}`), reported: { ready: null, forVersion: null } }); // adopted, its read not in yet
    expect(openDraft).not.toHaveBeenCalled();
    rerender({ params: search(`ws=1&v=${PUBLISHED}`), reported: { ready: readOf(PUBLISHED), forVersion: PUBLISHED } });
    expect(openDraft).toHaveBeenCalledTimes(1);
    expect(openDraft).toHaveBeenCalledWith(DRAFT);
    rerender({ params: search(`ws=1&v=${PUBLISHED}`), reported: { ready: readOf(PUBLISHED), forVersion: PUBLISHED } });
    expect(openDraft).toHaveBeenCalledTimes(1);
  });

  it('bare with a read for the bare address (no adoption): still fires once', () => {
    const { openDraft } = mount({ params: search('ws=1'), reported: { ready: readOf(PUBLISHED), forVersion: null } });
    expect(openDraft).toHaveBeenCalledWith(DRAFT);
  });

  it('a read for ANOTHER address (left over) does not fire; the fresh one does', () => {
    const { rerender, openDraft } = mount({ params: search('ws=1'), reported: { ready: null, forVersion: null } });
    rerender({ params: search(`ws=1&v=${PUBLISHED}`), reported: { ready: readOf('canvas_dother'), forVersion: 'canvas_dother' } });
    expect(openDraft).not.toHaveBeenCalled();
    rerender({ params: search(`ws=1&v=${PUBLISHED}`), reported: { ready: readOf(PUBLISHED), forVersion: PUBLISHED } });
    expect(openDraft).toHaveBeenCalledTimes(1);
  });

  it('a version picked after the hook let go is never dragged back to the draft', () => {
    const { rerender, openDraft } = mount({ params: search('ws=1'), reported: { ready: readOf(PUBLISHED, { draft: null }), forVersion: null } }); // fresh owner read, no draft: disarms
    rerender({ params: search('ws=1&v=canvas_dpicked'), reported: { ready: readOf('canvas_dpicked'), forVersion: 'canvas_dpicked' } });
    expect(openDraft).not.toHaveBeenCalled();
  });
});

describe('7: an address that never was bare', () => {
  it('explicit ?v=<published>&ws=1 from the first render stays on the published view (S3/J4)', () => {
    const { rerender, openDraft } = mount({ params: search(`v=${PUBLISHED}&ws=1`), reported: { ready: null, forVersion: null } });
    rerender({ params: search(`v=${PUBLISHED}&ws=1`), reported: { ready: readOf(PUBLISHED), forVersion: PUBLISHED } });
    expect(openDraft).not.toHaveBeenCalled();
  });

  it('CONTROL: a reader (not the owner) is never moved', () => {
    const { openDraft } = mount({ params: search('ws=1'), reported: { ready: readOf(PUBLISHED, { isOwner: false }), forVersion: null } });
    expect(openDraft).not.toHaveBeenCalled();
  });
});
