/**
 * @file p1536-walk5-bare-ws-choice.test.tsx
 * @description P1536 walkthrough 5: an owner's choice is never overridden by a bare-address memory. The first version seen after arriving bare is the
 * page's adoption; a different one after that is the owner's pick and disarms. A pending Clone (a bare address with no draft yet) disarms too.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { useBareWorkspaceDraft } from '@/app/pages/canvas/use-bare-workspace-draft';

const A = 'canvas_d111111';
const B = 'canvas_d222222';
const DRAFT = 'canvas_dabc123';
const readOf = (version: string) => ({ isOwner: true, version, draft: { version: DRAFT } }) as unknown as CanvasReady;
const search = (q: string) => new URLSearchParams(q);
const NONE = { ready: null, forVersion: null } as const;

interface Props { eligible: boolean; pendingClone: boolean; params: URLSearchParams; reported: { ready: CanvasReady | null; forVersion: string | null } }
function mount(initial: Props) {
  const openDraft = vi.fn();
  const hook = renderHook((p: Props) => useBareWorkspaceDraft({ ...p, openDraft }), { initialProps: initial });
  return { ...hook, openDraft };
}

describe('the owner picks another version before a qualifying read arrives', () => {
  it('bare, adopted A, B picked with a read that is not eligible yet, then eligible: no openDraft', () => {
    const { rerender, openDraft } = mount({ eligible: false, pendingClone: false, params: search('ws=1'), reported: NONE });
    rerender({ eligible: false, pendingClone: false, params: search(`ws=1&v=${A}`), reported: NONE });
    rerender({ eligible: false, pendingClone: false, params: search(`ws=1&v=${B}`), reported: { ready: readOf(B), forVersion: B } });
    rerender({ eligible: true, pendingClone: false, params: search(`ws=1&v=${B}`), reported: { ready: readOf(B), forVersion: B } });
    expect(openDraft).not.toHaveBeenCalled();
  });

  it('CONTROL: bare, adopted A, a read for A with a draft open and eligible: openDraft once', () => {
    const { rerender, openDraft } = mount({ eligible: true, pendingClone: false, params: search('ws=1'), reported: NONE });
    rerender({ eligible: true, pendingClone: false, params: search(`ws=1&v=${A}`), reported: NONE });
    rerender({ eligible: true, pendingClone: false, params: search(`ws=1&v=${A}`), reported: { ready: readOf(A), forVersion: A } });
    expect(openDraft).toHaveBeenCalledTimes(1);
    expect(openDraft).toHaveBeenCalledWith(DRAFT);
  });
});

describe('a pending Clone on a bare address', () => {
  it('bare with pendingClone, then pendingClone false and a picked version with a draft open: no openDraft', () => {
    const { rerender, openDraft } = mount({ eligible: true, pendingClone: true, params: search('ws=1'), reported: NONE });
    rerender({ eligible: true, pendingClone: false, params: search(`ws=1&v=${B}`), reported: { ready: readOf(B), forVersion: B } });
    expect(openDraft).not.toHaveBeenCalled();
  });
});
