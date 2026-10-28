// @vitest-environment jsdom
/**
 * P1586 invariant: a chat canvas/letter card whose read never answers becomes a readable line, and a
 * late answer for the same card replaces it. (The point/story card has its own deadline, p1512.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const read = vi.hoisted(() => ({ resolve: (_v: unknown) => {} }));
vi.mock('@/app/pages/chat/artifact-attachment-cache', async (orig) => ({
  ...(await orig<typeof import('@/app/pages/chat/artifact-attachment-cache')>()),
  loadArtifact: () => new Promise((resolve) => { read.resolve = resolve; }),
}));

import { ArtifactAttachmentCard } from '@/app/pages/chat/ArtifactAttachmentCard';
import { ATTACHMENT_TIMEOUT_MS } from '@/app/pages/chat/AttachmentCard';

// Pinned to the point/story card's deadline: one attachment deadline across both cards.
const ARTIFACT_TIMEOUT_MS = ATTACHMENT_TIMEOUT_MS;

describe('P1586 ArtifactAttachmentCard deadline', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const ui = () => render(<MemoryRouter><ArtifactAttachmentCard kind="canvas" id="canvas-id-1" viewerId="user-id-1" /></MemoryRouter>);

  it('skeleton before the deadline, a readable line after, the late answer replaces it', async () => {
    ui();
    await act(async () => { await vi.advanceTimersByTimeAsync(ARTIFACT_TIMEOUT_MS - 1); });
    expect(screen.getByRole('status', { name: 'Loading attachment' })).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByTestId('attachment-error').textContent).toContain("Couldn't load this canvas");

    await act(async () => { read.resolve({ available: false, kind: 'canvas' }); });
    expect(screen.queryByTestId('attachment-error')).toBeNull();
    expect(screen.getByTestId('attachment-canvas-unavailable')).toBeTruthy();
  });

  it('an answer before the deadline leaves no timer behind', async () => {
    const { unmount } = ui();
    await act(async () => { read.resolve({ available: false, kind: 'canvas' }); });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
