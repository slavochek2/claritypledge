/**
 * @file p1545-artifact-cache-sign-out.test.tsx
 * @description P1545: the chat artifact attachment cache is cleared on every way a session ends, like the
 *   other per-person caches AuthProvider owns. Harness mirrors p1515-link-token-session-end.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn(), reset: vi.fn(), identify: vi.fn() },
  isInternalAccount: vi.fn().mockResolvedValue(false),
}));
const svc = vi.hoisted(() => ({ getChatArtifact: vi.fn() }));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: svc }));

let authCallback: ((event: string, session: unknown) => void) | null = null;
const getSession = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: vi.fn(),
  },
}));
vi.mock('@/app/data/api', () => ({
  getProfileResult: vi.fn().mockResolvedValue({ success: true, data: { id: 'u1', name: 'T', isVerified: true } }),
  signOut: vi.fn().mockResolvedValue(undefined),
  patchClaritySessionLiveState: vi.fn(),
  clearSessionJoiner: vi.fn(),
}));
vi.mock('@/app/contexts/live-session-context', () => ({ clearActiveSessionFromStorage: vi.fn() }));

import { AuthProvider } from '@/auth/AuthContext';
import { loadArtifact, clearArtifactAttachmentCache } from '@/app/pages/chat/artifact-attachment-cache';

const SESSION = { user: { id: 'u1', email: 'u@example.com' }, expires_at: 1 } as unknown;
const card = { available: true, kind: 'canvas', id: 'cv1', name: 'x', ownerId: 'o', ownerName: null, ownerSlug: null, isOwner: false };

beforeEach(() => {
  vi.clearAllMocks();
  authCallback = null;
  clearArtifactAttachmentCache();
  svc.getChatArtifact.mockResolvedValue(card);
  getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
});

describe('the attachment cache goes when the session ends', () => {
  it('SIGNED_OUT clears it; CONTROL: a session starting does not', async () => {
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    authCallback!('INITIAL_SESSION', SESSION);
    await loadArtifact('canvas', 'cv1', 'u1');
    await loadArtifact('canvas', 'cv1', 'u1');
    expect(svc.getChatArtifact).toHaveBeenCalledTimes(1); // control: held

    authCallback!('SIGNED_OUT', null);
    await loadArtifact('canvas', 'cv1', 'u1');
    expect(svc.getChatArtifact).toHaveBeenCalledTimes(2);
  });
});
