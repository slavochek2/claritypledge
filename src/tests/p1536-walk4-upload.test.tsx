/**
 * @file p1536-walk4-upload.test.tsx
 * @description P1536 walkthrough 4, item 4: after the first Send of a Clone was accepted, the composer's Upload spot is the waiting status, not a
 * button: no second upload can start while the page moves to the new draft.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSummary } from '@/app/data/chat-service';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const next = vi.hoisted(() => ({ openNextDraft: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'owner-1', slug: 'ana' } }) }));
vi.mock('@/app/pages/canvas/workspace-next-draft', () => ({ openNextDraft: next.openNextDraft }));
vi.mock('@/app/pages/chat/use-canvas-availability', () => ({ useCanvasDraftAvailability: () => true, resetCanvasAvailability: vi.fn() }));

import { WorkspaceChat } from '@/app/pages/canvas/workspace-chat';

const mirror = { conversationId: 'c', kind: 'mirror', title: 'Mira', canSend: true } as unknown as ChatSummary;
const ready = { isOwner: true, draft: null, version: 'canvas_d1', versions: [{ name: 'canvas_d1', seq: 1 }], publishedNone: false } as unknown as CanvasReady;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => cleanup());

describe('4: no second upload after an accepted first Send', () => {
  it('before the Send the Upload button shows; after it was accepted only the waiting status does', async () => {
    next.openNextDraft.mockResolvedValue({ ok: true, versionName: 'canvas_dnew' });
    render(
      <MemoryRouter>
        <WorkspaceChat mirror={mirror} ready={ready} projectTag="canvas" focusable onClose={vi.fn()} onRunActive={vi.fn()} onOpened={vi.fn()} cloning={{ version: 'canvas_d1', seq: 1, replace: null }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('canvas-upload')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'first words' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
    expect(next.openNextDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('canvas-upload')).not.toBeInTheDocument();
    expect(screen.getByTestId('canvas-upload-waits')).toBeInTheDocument();
  });
});
