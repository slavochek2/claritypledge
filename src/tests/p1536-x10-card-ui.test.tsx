/**
 * @file p1536-x10-card-ui.test.tsx
 * @description P1536 §3c X10 (S3c.7), what a canvas thread root's card draws in the mirror chat:
 *  - OPEN:      the (Draft) tag, `v2`, and **Open draft** going to the workspace
 *  - PUBLISHED: `v2 · date` with no state word (X5: published needs no word), and **View** going to that version with no `ws=1`
 *  - DISCARDED: says so, no button
 *  - the card of a thread root is read through its thread (getCanvasRootCard), a quote's compact card keeps the attached version's read
 *  - (Draft) is ONE shared tag component (the canvas components folder), which step 4 reuses; a pending Clone's reads "New draft"
 * Real AttachmentCard and CanvasVersionCard; only the canvas draft reads are faked.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';

const svc = vi.hoisted(() => ({ getCanvasRootCard: vi.fn(), getCanvasVersionCard: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));

import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { CanvasVersionCard } from '@/app/pages/chat/CanvasVersionCard';
import { CanvasDraftTag } from '@/app/components/canvas/canvas-draft-tag';
import { CanvasWorkspaceContext } from '@/app/components/canvas/canvas-workspace-context';
import { lacksSecondaryPill } from './p1536-pill-assert';

const OPEN = '/p/ana/canvas/canvas_4?v=canvas_dd2&ws=1';
const V2 = '/p/ana/canvas/canvas_4?v=canvas_dd2';
const card = (over: Partial<CanvasVersionCardData>): CanvasVersionCardData => ({
  title: 'Canvas 4', canvasId: 'cv-1', label: 'v2 · Nov 2, 2026', state: 'published', draft: false, href: V2, openHref: V2, seq: 2, hasThread: true, draftId: 'd-1', ...over,
});
const openDraft = card({ state: 'draft', draft: true, label: 'Draft', nextSeq: 2, href: OPEN, openHref: OPEN, seq: undefined });
const discarded = card({ state: 'discarded', label: 'Discarded', href: '/p/ana/canvas/canvas_4', openHref: '/p/ana/canvas/canvas_4', seq: undefined });

const draw = (data: CanvasVersionCardData, inWorkspace = false) =>
  render(
    <MemoryRouter>
      <CanvasWorkspaceContext.Provider value={{ active: inWorkspace, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: null, cloneSeq: null, ownerBar: false }}>
        <CanvasVersionCard data={data} />
      </CanvasWorkspaceContext.Provider>
    </MemoryRouter>,
  );

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('X10: the card by state', () => {
  it('open: the (Draft) tag, v2, and Open draft going to the workspace (a secondary pill)', () => {
    draw(openDraft);
    const line = screen.getByTestId('canvas-version-state');
    expect(within(line).getByTestId('canvas-draft-tag')).toHaveTextContent('Draft');
    expect(line).toHaveTextContent('v2');
    const open = screen.getByRole('link', { name: /Open draft/ });
    expect(open).toHaveTextContent('Open draft');
    expect(open).toHaveAttribute('href', OPEN);
    expect(lacksSecondaryPill(open)).toEqual([]);
  });

  it('published: v2 and its date, no tag and no state word, View goes to that version with no ws=1', () => {
    draw(card({}));
    const line = screen.getByTestId('canvas-version-state');
    expect(line).toHaveTextContent('v2 · Nov 2, 2026');
    expect(line).not.toHaveTextContent(/Published|Draft/);
    expect(screen.queryByTestId('canvas-draft-tag')).toBeNull();
    const view = screen.getByRole('link', { name: /View/ });
    expect(view).toHaveTextContent('View');
    expect(view.getAttribute('href')).toBe(V2);
    expect(view.getAttribute('href')).not.toContain('ws=1');
    expect(lacksSecondaryPill(view)).toEqual([]);
  });

  it('discarded: says so, and has no button', () => {
    draw(discarded);
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('Discarded draft');
    expect(screen.queryByTestId('canvas-draft-tag')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a draft with no number known still wears the tag (no "v" fragment)', () => {
    draw({ ...openDraft, nextSeq: null });
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent(/^Draft$/);
  });

  it('inside the workspace\'s thread panel (the canvas is the other pane) there is no button at all', () => {
    draw(openDraft, true);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('X6 (built here, reused by step 4): one (Draft) tag component', () => {
  it('reads "Draft" by default and "New draft" for a pending Clone; both are the same tag element', () => {
    render(<><CanvasDraftTag /><CanvasDraftTag>New draft</CanvasDraftTag></>);
    const [a, b] = screen.getAllByTestId('canvas-draft-tag');
    expect(a).toHaveTextContent(/^Draft$/);
    expect(b).toHaveTextContent(/^New draft$/);
    expect(a!.className).toBe(b!.className);
  });

  it('is visible at a glance: a bordered, filled tag that never shrinks, and not an action look (not a blue pill, not amber)', () => {
    render(<CanvasDraftTag />);
    const cls = screen.getByTestId('canvas-draft-tag').className;
    expect(cls).toContain('shrink-0');
    expect(cls).toContain('border');
    expect(cls).not.toMatch(/blue|amber|orange|yellow|purple/);
  });
});

describe('X10: which read feeds the card', () => {
  const mount = (props: { compact?: boolean; rootId?: string }) =>
    render(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId="me" {...props} /></MemoryRouter>);

  it('a thread root\'s card is read through ITS THREAD, with the root\'s own id', async () => {
    svc.getCanvasRootCard.mockResolvedValue(openDraft);
    mount({ rootId: 'root-1' });
    await screen.findByTestId('canvas-draft-tag');
    expect(svc.getCanvasRootCard).toHaveBeenCalledWith('root-1', 'ver-1', 'me');
    expect(svc.getCanvasVersionCard).not.toHaveBeenCalled();
  });

  it('CONTROL: a card with no root id (an attachment in a quote or a reply) is read by the attached version, as before', async () => {
    svc.getCanvasVersionCard.mockResolvedValue(card({ hasThread: undefined, draftId: undefined }));
    mount({});
    await screen.findByTestId('attachment-canvas_version');
    expect(svc.getCanvasVersionCard).toHaveBeenCalledWith('ver-1', 'me');
    expect(svc.getCanvasRootCard).not.toHaveBeenCalled();
  });

  it('a card with no thread and no version of the viewer\'s is "Not available to you"', async () => {
    svc.getCanvasRootCard.mockResolvedValue(null);
    mount({ rootId: 'root-1' });
    expect(await screen.findByText('Not available to you')).toBeInTheDocument();
  });
});
