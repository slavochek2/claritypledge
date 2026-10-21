/**
 * P1512: the nav reads the stored supabase session synchronously for its first paint.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storedSessionUserId } from '@/lib/offline-read-cache';

const key = () => `sb-${new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split('.')[0]}-auth-token`;

describe('storedSessionUserId', () => {
  beforeEach(() => localStorage.clear());

  it('returns the user id of a stored session', () => {
    localStorage.setItem(key(), JSON.stringify({ access_token: 'x', user: { id: 'user-id-1234' } }));
    expect(storedSessionUserId()).toBe('user-id-1234');
  });
  it('is null with no stored session', () => {
    expect(storedSessionUserId()).toBeNull();
  });
  it('is null for malformed JSON', () => {
    localStorage.setItem(key(), '{not json');
    expect(storedSessionUserId()).toBeNull();
  });
  it('is null when the session carries no user id', () => {
    localStorage.setItem(key(), JSON.stringify({ access_token: 'x', user: {} }));
    expect(storedSessionUserId()).toBeNull();
  });
});
