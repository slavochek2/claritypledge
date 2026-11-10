/**
 * P1621: the shared follow-up re-read after a hand edit, add or removal (canvas-draft-reread.ts). Outcomes for one draft while the tab is
 * hidden coalesce into one re-read; different drafts stay independent; once a re-read fires, the next outcome schedules again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pending: Array<() => void> = [];
vi.mock('@/app/prototypes/events/when-visible', () => ({ whenVisible: (fn: () => void) => { pending.push(fn); } }));
const emit = vi.fn();
vi.mock('@/app/data/canvas-draft-events', () => ({ emitCanvasDraftEvent: (e: unknown) => emit(e) }));

import { reReadWhenVisible } from '@/app/data/canvas-draft-reread';

const showTab = () => { while (pending.length) pending.shift()!(); };

describe('reReadWhenVisible', () => {
  beforeEach(() => { showTab(); emit.mockClear(); });

  it('coalesces several outcomes for one draft while hidden into one re-read', () => {
    reReadWhenVisible('d1'); reReadWhenVisible('d1'); reReadWhenVisible('d1');
    expect(emit).not.toHaveBeenCalled();
    showTab();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ kind: 'updated', draftId: 'd1' });
  });

  it('keeps different drafts independent', () => {
    reReadWhenVisible('d1'); reReadWhenVisible('d2');
    showTab();
    expect(emit.mock.calls.map(c => (c[0] as { draftId: string }).draftId).sort()).toEqual(['d1', 'd2']);
  });

  it('schedules again after the tab comes back', () => {
    reReadWhenVisible('d1'); showTab();
    reReadWhenVisible('d1'); showTab();
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('is the one helper the add, edit and remove calls share', async () => {
    const [add, edit, remove] = await Promise.all([
      import('@/app/data/canvas-draft-add-call?raw'), import('@/app/data/canvas-draft-edit-call?raw'), import('@/app/data/canvas-draft-remove-call?raw'),
    ]);
    for (const src of [add.default, edit.default, remove.default]) {
      expect(src).toContain("import { reReadWhenVisible } from './canvas-draft-reread';");
      expect(src).not.toContain('pendingReReads');
    }
  });
});
