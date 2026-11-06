/**
 * P1529 review round: the step's reads. The REAL canvas-open-drafts runs over a faked table, so a second versions read or an arbitrary
 * "first draft" would show. One listMyCanvasVersions per load; with several open drafts, Continue your draft opens the most worked one.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  versionsCalls: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: h.rows, error: null }) }) }) } }));
vi.mock('@/app/data/event-mastermind-service', () => ({ getMyEventCanvas: async () => null, setEventCanvas: vi.fn() }));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { shareCanvas: vi.fn() } }));
vi.mock('@/app/data/canvas-draft-service', () => ({ listMyCanvasVersions: async () => { h.versionsCalls(); return []; } }));
vi.mock('@/app/pages/chat/chat-state', () => ({ useChat: () => ({ userId: 'u1', authors: { u1: { slug: 'ana' } }, refresh: async () => null }) }));
vi.mock('@/app/pages/chat/chat-hooks', () => ({ useMediaQuery: () => true }));
vi.mock('@/app/pages/chat/use-start-canvas', () => ({ useStartCanvas: () => ({ start: vi.fn(), dialog: null }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { EventCanvasStep } from '@/app/prototypes/events/prep/EventCanvasStep';

const row = (n: number, run: number, rev: number, base: string | null = null, id = `d${n}`) => ({ base_version_id: base, id, canvas_id: `c${n}`, canvas_name: `canvas_${n}`, version_name: `canvas_d${n}`, conversation_id: 'cv', thread_root_id: 't', revision: rev, run_count: run });
const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
const renderStep = () => render(<MemoryRouter initialEntries={['/events/x/prepare']}><EventCanvasStep eventId="ev-1" barRef={createRef()} onContinue={vi.fn()} onSkip={vi.fn()} /><Where /></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); h.rows = []; });

describe('the canvas step reads', () => {
  it('reads the published versions once per load', async () => {
    h.rows = [row(1, 0, 0)];
    renderStep();
    await screen.findByRole('button', { name: 'Continue your draft' });
    expect(h.versionsCalls).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['worked draft last', [row(1, 0, 5), row(2, 3, 1)]],
    ['worked draft first', [row(2, 3, 1), row(1, 0, 5)]],
  ])('Continue your draft opens the most worked draft (%s)', async (_n, rows) => {
    h.rows = rows;
    renderStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue your draft' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/canvas_2'));
  });
  it('equal run counts: the higher revision wins, in either order', async () => {
    h.rows = [row(1, 2, 1), row(2, 2, 9)];
    const a = renderStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue your draft' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/canvas_2'));
    a.unmount();
    h.rows = [row(2, 2, 9), row(1, 2, 1)];
    renderStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue your draft' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/canvas_2'));
  });
  it('an edit draft of a published canvas is not an open draft: alone, step 4 is state A', async () => {
    h.rows = [row(1, 5, 5, 'v-published')];
    renderStep();
    expect(await screen.findByRole('button', { name: 'Create your canvas' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue your draft' })).toBeNull();
  });
  it('an edit draft with a higher run_count does not outrank a new-canvas draft', async () => {
    h.rows = [row(1, 9, 9, 'v-published'), row(2, 1, 1)];
    renderStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue your draft' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/canvas_2'));
  });
  it.each([
    ['ascending', [row(1, 2, 3, null, 'a1'), row(2, 2, 3, null, 'b2')]],
    ['descending', [row(2, 2, 3, null, 'b2'), row(1, 2, 3, null, 'a1')]],
  ])('equal run count and revision: the higher draft id wins (%s)', async (_n, rows) => {
    h.rows = rows;
    renderStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue your draft' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/canvas_2'));
  });
});
