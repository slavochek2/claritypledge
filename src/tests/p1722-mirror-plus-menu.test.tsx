/**
 * P1722 item 1: the Mirror's + renders when Clarify OR canvas drafting is available. "New point" only with Clarify; the two canvas items only with drafting.
 * "Modify a canvas" is the renamed item. New point opens the New point thread on the Mirror chat.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const avail = vi.hoisted(() => ({ canvas: false as boolean | null, clarify: false as boolean | null }));
const clarifyChat = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/pages/chat/use-canvas-availability', () => ({ useCanvasDraftAvailability: () => avail.canvas }));
vi.mock('@/app/pages/chat/use-clarify-availability', () => ({ useClarifyDraftAvailability: () => avail.clarify }));
vi.mock('@/app/pages/chat/use-clarify-chat', () => ({ useClarifyChat: () => clarifyChat }));
vi.mock('@/app/pages/chat/use-start-canvas', () => ({ useStartCanvas: () => ({ start: vi.fn(), dialog: null }) }));
vi.mock('@/app/pages/chat/chat-state', () => ({ useChat: () => ({ authors: {}, userId: 'user-id-me' }) }));
vi.mock('@/app/pages/chat/CanvasVersionPicker', () => ({ CanvasVersionPicker: () => null }));

import { CanvasPlusMenu } from '@/app/pages/chat/CanvasPlusMenu';

const open = () => {
  render(<MemoryRouter><CanvasPlusMenu conversationId="conv-mirror-1" /></MemoryRouter>);
  const plus = screen.queryByTestId('composer-plus');
  if (plus) fireEvent.pointerDown(plus, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  return plus;
};
const labels = () => screen.getAllByRole('menuitem').map((i) => i.textContent);

beforeEach(() => { avail.canvas = false; avail.clarify = false; clarifyChat.mockClear(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(cleanup);

describe('Mirror + menu', () => {
  it('both on: New point, New canvas, Modify a canvas', async () => {
    avail.canvas = true; avail.clarify = true;
    open();
    await screen.findByTestId('plus-new-point');
    expect(labels()).toEqual(['New point', 'New canvas', 'Modify a canvas']);
  });
  it('Clarify on, canvas drafting off: the + shows with New point only', async () => {
    avail.clarify = true;
    expect(open()).not.toBeNull();
    await screen.findByTestId('plus-new-point');
    expect(labels()).toEqual(['New point']);
  });
  it('canvas on, Clarify off: the two canvas items only', async () => {
    avail.canvas = true;
    open();
    await screen.findByTestId('plus-new-canvas');
    expect(labels()).toEqual(['New canvas', 'Modify a canvas']);
  });
  it('both off or unknown: no +', () => {
    expect(open()).toBeNull();
    cleanup();
    avail.clarify = null; avail.canvas = null;
    expect(open()).toBeNull();
  });
  it('New point opens the New point thread on the Mirror chat (no draft)', async () => {
    avail.clarify = true;
    open();
    fireEvent.click(await screen.findByTestId('plus-new-point'));
    expect(clarifyChat).toHaveBeenCalledWith('conv-mirror-1', { draft: false });
  });
  it('Modify a canvas opens a dialog titled with the item label', async () => {
    avail.canvas = true;
    open();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Modify a canvas' }));
    expect(await screen.findByRole('dialog', { name: 'Modify a canvas' })).toBeInTheDocument();
  });
});
