/**
 * @file p1536-x4-header-model.test.ts
 * @description P1536 3c X4 (S3c.4): the header table, row by row, against the ONE pure function that decides it (headerRow). The expectations below
 * are typed from the spec's table, not derived from the code: beside the name, the right side left to right, and which one is filled. "Where two
 * rows fit, the more specific wins" is pinned by the cap rows. The bar that draws the header reads the same function (p1536-x4-header-bar.test.tsx).
 */
import { describe, expect, it } from 'vitest';
import { headerInputOf, headerRow, type HeaderInput } from '@/app/components/canvas/canvas-header-model';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

/** A published, owner, drafting-on, nothing-else baseline; each row overrides what makes it that row. */
const BASE: HeaderInput = {
  owner: true, drafting: true, onScreen: 'published', hasPublished: true, hasBase: false, workspace: false, draftOpen: false,
  spot: 'nothing', busy: false, atCap: false, threadButton: false, goToDraft: false,
};

interface Row { name: string; input: Partial<HeaderInput>; tag: 'draft' | 'new-draft' | null; picker: boolean; items: string[]; spot: 'share' | 'publish' | 'status' | 'none' }

/** The table of 3c X4, one entry per row (a row whose right side has Thread* is run with the Thread button on AND off below). */
const ROWS: Row[] = [
  { name: 'Published, owner, no draft', input: {}, tag: null, picker: true, items: ['clone'], spot: 'share' },
  { name: 'Published, owner, draft open, reached by View (no ws=1)', input: { draftOpen: true }, tag: null, picker: true, items: ['clone'], spot: 'share' },
  { name: 'Published, owner, draft open, picked from the picker (ws=1)', input: { draftOpen: true, workspace: true }, tag: null, picker: true, items: ['thread'], spot: 'share' },
  { name: 'Pending Clone', input: { onScreen: 'pending', workspace: true }, tag: 'new-draft', picker: false, items: ['thread', 'cancel'], spot: 'status' },
  { name: 'Never published, no points', input: { onScreen: 'draft', hasPublished: false, workspace: true, draftOpen: true, spot: 'nothing' }, tag: 'draft', picker: false, items: ['thread', 'discard'], spot: 'status' },
  { name: 'Never published, with points (also newest run failed, or at the cap)', input: { onScreen: 'draft', hasPublished: false, workspace: true, draftOpen: true, spot: 'publish' }, tag: 'draft', picker: false, items: ['thread', 'discard'], spot: 'publish' },
  { name: 'Draft with a base, no points left, or no difference from base', input: { onScreen: 'draft', hasBase: true, workspace: true, draftOpen: true, spot: 'nothing' }, tag: 'draft', picker: true, items: ['thread', 'discard'], spot: 'status' },
  { name: 'Draft with a base, points and a difference (also newest run failed, or at the cap)', input: { onScreen: 'draft', hasBase: true, workspace: true, draftOpen: true, spot: 'publish' }, tag: 'draft', picker: true, items: ['thread', 'discard'], spot: 'publish' },
  { name: 'Updating, never published', input: { onScreen: 'draft', hasPublished: false, workspace: true, draftOpen: true, spot: 'updating', busy: true }, tag: 'draft', picker: false, items: ['thread'], spot: 'status' },
  { name: 'Publishing, with a base', input: { onScreen: 'draft', hasBase: true, workspace: true, draftOpen: true, spot: 'publish', busy: true }, tag: 'draft', picker: true, items: ['thread'], spot: 'status' },
  { name: 'Pending Clone while its first Send is going: no picker yet, no Discard, no Cancel', input: { onScreen: 'pending', workspace: true, spot: 'updating', busy: true }, tag: 'new-draft', picker: false, items: ['thread'], spot: 'status' },
  { name: 'At the cap, nothing to publish, with a base: Start over is in the composer, not here', input: { onScreen: 'draft', hasBase: true, workspace: true, draftOpen: true, spot: 'nothing', atCap: true }, tag: 'draft', picker: true, items: ['thread'], spot: 'status' },
  { name: 'At the cap, nothing to publish, never published', input: { onScreen: 'draft', hasPublished: false, workspace: true, draftOpen: true, spot: 'nothing', atCap: true }, tag: 'draft', picker: false, items: ['thread'], spot: 'status' },
  { name: 'At the cap WITH something to publish: the specific row does not apply, Discard stays', input: { onScreen: 'draft', hasBase: true, workspace: true, draftOpen: true, spot: 'publish', atCap: true }, tag: 'draft', picker: true, items: ['thread', 'discard'], spot: 'publish' },
  { name: 'A run on another canvas, this draft has points and differs: as the draft, Publish', input: { onScreen: 'draft', hasBase: true, workspace: true, draftOpen: true, spot: 'publish', busy: false }, tag: 'draft', picker: true, items: ['thread', 'discard'], spot: 'publish' },
  { name: 'A run on another canvas, this draft has nothing to publish: the status', input: { onScreen: 'draft', hasBase: true, workspace: true, draftOpen: true, spot: 'nothing', busy: false }, tag: 'draft', picker: true, items: ['thread', 'discard'], spot: 'status' },
  { name: 'Published picked from the picker (ws=1) while the open draft is updating: the status holds the spot, never a flash of Share', input: { draftOpen: true, workspace: true, spot: 'updating', busy: true }, tag: null, picker: true, items: ['thread'], spot: 'status' },
  { name: 'Published picked from the picker (ws=1) while the page is reading again: Share STAYS (X4: only Updating and Publishing replace the main action; premise change, it was a skeleton)', input: { draftOpen: true, workspace: true, spot: 'loading' }, tag: null, picker: true, items: ['thread'], spot: 'share' },
  { name: 'Reader or signed out', input: { owner: false }, tag: null, picker: true, items: [], spot: 'none' },
  { name: 'Reader of a canvas with nothing published', input: { owner: false, hasPublished: false }, tag: null, picker: false, items: [], spot: 'none' },
  { name: 'Drafting off, published, owner', input: { drafting: false }, tag: null, picker: true, items: [], spot: 'share' },
  { name: 'Drafting off, draft, owner, with a base', input: { drafting: false, onScreen: 'draft', hasBase: true, draftOpen: true }, tag: 'draft', picker: true, items: [], spot: 'none' },
  { name: 'Drafting off, draft, owner, never published', input: { drafting: false, onScreen: 'draft', hasPublished: false, draftOpen: true }, tag: 'draft', picker: false, items: [], spot: 'none' },
];

describe('X4: the header table, every row', () => {
  it.each(ROWS)('$name', ({ input, tag, picker, items, spot }) => {
    // Thread is a table item only while the panel is closed on a wide screen, and only in the workspace: with the button on it leads the items.
    const off = headerRow({ ...BASE, ...input, threadButton: false });
    expect(off.items).toEqual(items.filter(i => i !== 'thread'));
    const on = headerRow({ ...BASE, ...input, threadButton: true });
    expect(on.items).toEqual(items);
    expect(on.tag).toBe(tag);
    expect(on.picker).toBe(picker);
    expect(on.spot).toBe(spot);
  });

  it('exactly one filled item per row at most, and it is the spot: Share on a published view, Publish on a draft, nothing else', () => {
    for (const r of ROWS) {
      const row = headerRow({ ...BASE, ...r.input, threadButton: true });
      expect(row.filled).toBe(r.spot === 'share' || r.spot === 'publish' ? r.spot : null);
      expect(row.items).not.toContain('share');
      expect(row.items).not.toContain('publish');
    }
  });

  it('Share never appears on a draft or a pending Clone (a draft has no access dialog)', () => {
    for (const r of ROWS.filter(r => r.input.onScreen === 'draft' || r.input.onScreen === 'pending')) {
      expect(headerRow({ ...BASE, ...r.input }).spot).not.toBe('share');
    }
  });

  it('Thread leads the right side whenever it is there (before Cancel and Discard)', () => {
    expect(headerRow({ ...BASE, onScreen: 'pending', workspace: true, threadButton: true }).items).toEqual(['thread', 'cancel']);
    expect(headerRow({ ...BASE, onScreen: 'draft', hasBase: true, draftOpen: true, workspace: true, spot: 'publish', threadButton: true }).items).toEqual(['thread', 'discard']);
  });

  it('X13: on a phone a published version picked from a draft adds Go to draft before Share; nowhere else', () => {
    expect(headerRow({ ...BASE, draftOpen: true, workspace: true, goToDraft: true }).items).toEqual(['go-to-draft']);
    expect(headerRow({ ...BASE, draftOpen: true, workspace: true, goToDraft: true, threadButton: true }).items).toEqual(['thread', 'go-to-draft']);
    expect(headerRow({ ...BASE, draftOpen: true, workspace: false, goToDraft: true }).items).toEqual(['clone']);
    expect(headerRow({ ...BASE, onScreen: 'draft', hasBase: true, draftOpen: true, workspace: true, goToDraft: true, spot: 'publish' }).items).not.toContain('go-to-draft');
  });

  it('CONTROL (gate 7): a deliberately wrong table (Share on a draft) is caught by the same comparison', () => {
    const row = headerRow({ ...BASE, onScreen: 'draft', hasBase: true, draftOpen: true, workspace: true, spot: 'publish' });
    expect(row.spot === 'share').toBe(false);
    expect(() => expect(row.spot).toBe('share')).toThrow();
  });
});

/** A read as the owner's bar sees it. */
const readyOf = (o: { onScreen: 'published' | 'draft'; draft?: boolean; hasPublished?: boolean }): CanvasReady => ({
  isOwner: true, version: o.onScreen === 'draft' ? 'd' : 'v1', publishedNone: o.hasPublished === false,
  versions: [...(o.draft || o.onScreen === 'draft' ? [{ name: 'd', draft: true, seq: null }] : []), ...(o.hasPublished === false ? [] : [{ name: 'v1', draft: false, seq: 1 }])],
  draft: o.draft || o.onScreen === 'draft' ? { version: 'd', baseSeq: 1, runCount: 1, changedBoxes: [] } : null,
}) as unknown as CanvasReady;
const inputOf = (ready: CanvasReady, over: Partial<Parameters<typeof headerInputOf>[0]> = {}) =>
  headerInputOf({ ready, drafting: true, workspace: true, pendingSeq: null, cloning: false, spot: 'nothing', publishing: false, threadButton: false, goToDraft: false, ...over });

describe('review: ONE source for the pending Clone (the bar and the thread panel agree)', () => {
  it('ws=1 on a published version with no open draft IS the pending Clone, even before the Clone state has read (a reload of the pending address)', () => {
    const input = inputOf(readyOf({ onScreen: 'published' }));
    expect(input.onScreen).toBe('pending');
    expect(headerRow(input)).toMatchObject({ tag: 'new-draft', picker: false, spot: 'status' });
  });
  it('the Clone state saying so (a J4 start over: a draft of another base is open) is pending too, whatever the version number is', () => {
    expect(inputOf(readyOf({ onScreen: 'published', draft: true }), { cloning: true }).onScreen).toBe('pending');
    expect(inputOf(readyOf({ onScreen: 'published', draft: true }), { pendingSeq: 2 }).onScreen).toBe('pending');
  });
  it('CONTROLS: with a draft open and no Clone it is the picked-from-the-picker row; without ws=1 a published view is a published view; a draft on screen is a draft', () => {
    expect(inputOf(readyOf({ onScreen: 'published', draft: true })).onScreen).toBe('published');
    expect(inputOf(readyOf({ onScreen: 'published' }), { workspace: false }).onScreen).toBe('published');
    expect(inputOf(readyOf({ onScreen: 'draft' })).onScreen).toBe('draft');
  });
  it('drafting off: ws=1 on a published version is not a Clone (there is no workspace without drafting)', () => {
    expect(inputOf(readyOf({ onScreen: 'published' }), { drafting: false }).onScreen).toBe('published');
  });
});

describe('review: an owner with nothing published and no draft (the table has no row; the nearest rule, 9: nothing to act on, a status says so)', () => {
  it('no picker, no tag, no Clone (there is no version to clone), no Share (nothing to share): the status "Nothing to publish yet" in the spot', () => {
    const input = inputOf(readyOf({ onScreen: 'published', hasPublished: false }), { workspace: false });
    expect(headerRow(input)).toEqual({ tag: null, picker: false, items: [], spot: 'status', filled: null });
  });
});

describe('review 5, item 5: drafting off follows X4 (nothing to show), also for a never-published canvas with no draft', () => {
  it('drafting off, nothing published, no draft: no items, no spot; with drafting on the same state is rule 9\'s status', () => {
    expect(headerRow({ ...BASE, owner: true, drafting: false, hasPublished: false })).toEqual({ tag: null, picker: false, items: [], spot: 'none', filled: null });
    expect(headerRow({ ...BASE, owner: true, drafting: true, hasPublished: false })).toMatchObject({ spot: 'status' });
  });
});
