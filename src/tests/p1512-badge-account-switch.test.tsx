/**
 * P1512 (Codex review): a badge request still in flight for a previous account must not
 * overwrite the badge of the account now signed in.
 */
import { it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ user: { id: 'a', email: 'a@example.com' } as { id: string; email: string } | null, letters: vi.fn(), invites: vi.fn() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/app/data/letters-service', () => ({ getUnreadLetterCount: state.letters }));
vi.mock('@/app/data/agreements-service', () => ({ agreementsService: { getIncomingInvitations: state.invites } }));

import { useUnreadLetterCount } from '@/app/hooks/useUnreadLetterCount';
import { usePendingPartnerInvitationCount } from '@/app/hooks/usePendingPartnerInvitationCount';

it('unread letters: a late answer for the previous account is dropped', async () => {
  state.user = { id: 'a', email: 'a@example.com' };
  let resolveA!: (n: number) => void;
  state.letters.mockImplementation((id: string) => (id === 'a' ? new Promise<number>((r) => { resolveA = r; }) : Promise.resolve(2)));
  const { result, rerender } = renderHook(() => useUnreadLetterCount());
  await act(async () => { await Promise.resolve(); });
  state.user = { id: 'b', email: 'b@example.com' };
  rerender();
  await waitFor(() => expect(result.current.count).toBe(2));
  await act(async () => { resolveA(17); });
  expect(result.current.count).toBe(2);
});

it('partner invitations: a late answer for the previous account is dropped', async () => {
  state.user = { id: 'a', email: 'a@example.com' };
  let resolveA!: (v: unknown[]) => void;
  state.invites.mockImplementation((_email: string, id: string) => (id === 'a' ? new Promise<unknown[]>((r) => { resolveA = r; }) : Promise.resolve([{}])));
  const { result, rerender } = renderHook(() => usePendingPartnerInvitationCount());
  await act(async () => { await Promise.resolve(); });
  state.user = { id: 'b', email: 'b@example.com' };
  rerender();
  await waitFor(() => expect(result.current.count).toBe(1));
  await act(async () => { resolveA([{}, {}, {}]); });
  expect(result.current.count).toBe(1);
});
