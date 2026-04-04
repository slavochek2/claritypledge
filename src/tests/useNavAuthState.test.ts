/**
 * @file useNavAuthState.test.ts
 * @description Unit tests for useNavAuthState hook
 *
 * Tests the derived state computed from useAuth:
 * - User menu visibility (requires verified user + session checked)
 * - Public CTA visibility (inverse of user menu)
 * - User nulling when not verified
 * - hasPledged and slug derivation with nulling
 * - Session and verification state
 * - signOut passthrough
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock useAuth
vi.mock('@/auth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/auth';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import type { Profile } from '@/app/types';

const mockUseAuth = vi.mocked(useAuth);

describe('useNavAuthState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Anonymous (no session, no user)', () => {
    it('shows public CTAs and no user menu', () => {
      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.showPublicCTAs).toBe(true);
      expect(result.current.showUserMenu).toBe(false);
    });

    it('returns null user', () => {
      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.user).toBeNull();
    });

    it('reports no session', () => {
      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.hasSession).toBe(false);
    });

    it('reports not verified', () => {
      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.isVerified).toBe(false);
    });

    it('returns default hasPledged and slug', () => {
      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.hasPledged).toBe(false);
      expect(result.current.slug).toBeNull();
    });
  });

  describe('Loading state (isLoading=true)', () => {
    it('shows public CTAs while loading', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User Name',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: true,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.showPublicCTAs).toBe(true);
      expect(result.current.showUserMenu).toBe(false);
    });

    it('reports loading state', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User Name',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: true,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('Session exists but user unverified (isVerified=false)', () => {
    it('shows public CTAs', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User Name',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: false,
          witnesses: [],
          reciprocations: 0,
          hasPledged: false,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.showPublicCTAs).toBe(true);
      expect(result.current.showUserMenu).toBe(false);
    });

    it('reports session exists', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User Name',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: false,
          witnesses: [],
          reciprocations: 0,
          hasPledged: false,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.hasSession).toBe(true);
    });

    it('reports not verified', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User Name',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: false,
          witnesses: [],
          reciprocations: 0,
          hasPledged: false,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.isVerified).toBe(false);
    });

    it('returns null user even though session exists', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User Name',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: false,
          witnesses: [],
          reciprocations: 0,
          hasPledged: false,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.user).toBeNull();
    });
  });

  describe('Session exists but sessionChecked=false', () => {
    it('shows public CTAs (not ready yet)', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User Name',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: false,
        sessionChecked: false,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.showPublicCTAs).toBe(true);
      expect(result.current.showUserMenu).toBe(false);
    });

    it('reports sessionChecked=false', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User Name',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: false,
        sessionChecked: false,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.sessionChecked).toBe(false);
    });
  });

  describe('Verified user (all conditions met)', () => {
    it('shows user menu and hides public CTAs', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'verified-user',
          name: 'Verified User',
          email: 'verified@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.showUserMenu).toBe(true);
      expect(result.current.showPublicCTAs).toBe(false);
    });

    it('populates user object', () => {
      const verifiedUser: Profile = {
        id: 'user-1',
        slug: 'verified-user',
        name: 'Verified User',
        email: 'verified@example.com',
        signedAt: '2024-01-01',
        isVerified: true,
        witnesses: [],
        reciprocations: 5,
        hasPledged: true,
        avatarColor: '#3B82F6',
      };

      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: verifiedUser,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.user).toBe(verifiedUser);
    });

    it('reports verified', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'verified-user',
          name: 'Verified User',
          email: 'verified@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.isVerified).toBe(true);
    });

    it('has session', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'verified-user',
          name: 'Verified User',
          email: 'verified@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.hasSession).toBe(true);
    });
  });

  describe('hasPledged derivation', () => {
    it('returns true for verified user with hasPledged=true', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.hasPledged).toBe(true);
    });

    it('returns false for verified user with hasPledged=false', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: false,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.hasPledged).toBe(false);
    });

    it('returns false for null user', () => {
      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.hasPledged).toBe(false);
    });

    it('returns hasPledged value even for unverified user (derived independently)', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: false,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true, // returned directly from user object
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      // hasPledged is derived from user?.hasPledged, not from showUserMenu
      expect(result.current.hasPledged).toBe(true);
    });
  });

  describe('slug derivation', () => {
    it('returns slug for verified user', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'john-doe',
          name: 'John Doe',
          email: 'john@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.slug).toBe('john-doe');
    });

    it('returns null for null user', () => {
      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.slug).toBeNull();
    });

    it('returns slug value even for unverified user (derived independently)', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug', // returned directly from user object
          name: 'User',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: false,
          witnesses: [],
          reciprocations: 0,
          hasPledged: false,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      // slug is derived from user?.slug, not from showUserMenu
      expect(result.current.slug).toBe('user-slug');
    });

    it('returns null when slug is null in verified user', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: null,
          name: 'User',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          hasPledged: true,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.slug).toBeNull();
    });
  });

  describe('signOut passthrough', () => {
    it('returns the same signOut function from useAuth', () => {
      const mockSignOut = vi.fn();

      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: false,
        sessionChecked: true,
        signOut: mockSignOut,
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.signOut).toBe(mockSignOut);
    });

    it('signOut is callable and returns a Promise', async () => {
      const mockSignOut = vi.fn().mockResolvedValue(undefined);

      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: false,
        sessionChecked: true,
        signOut: mockSignOut,
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      const promise = result.current.signOut();

      expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('handles isVerified explicitly set to false (not undefined)', () => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: {
          id: 'user-1',
          slug: 'user-slug',
          name: 'User',
          email: 'user@example.com',
          signedAt: '2024-01-01',
          isVerified: false,
          witnesses: [],
          reciprocations: 0,
          hasPledged: false,
        } as Profile,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      expect(result.current.isVerified).toBe(false);
      expect(result.current.showUserMenu).toBe(false);
    });

    it('verifies explicit truthiness check for isVerified (not just truthy)', () => {
      const userWithoutIsVerified = {
        id: 'user-1',
        slug: 'user-slug',
        name: 'User',
        email: 'user@example.com',
        signedAt: '2024-01-01',
        // isVerified is missing
        witnesses: [],
        reciprocations: 0,
        hasPledged: true,
      } as any;

      mockUseAuth.mockReturnValue({
        session: { user: { id: 'user-1' } } as any,
        user: userWithoutIsVerified,
        isLoading: false,
        sessionChecked: true,
        signOut: vi.fn(),
      } as any);

      const { result } = renderHook(() => useNavAuthState());

      // Missing isVerified should be treated as not verified
      expect(result.current.isVerified).toBe(false);
      expect(result.current.showUserMenu).toBe(false);
    });
  });
});
