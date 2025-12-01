import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthCallbackPage, useAuth } from '@/auth';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// MOCKS
// -----------------------------------------------------------------------------

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock Supabase
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockUpsert = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: any) => {
        mockOnAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: (table: string) => {
      mockFrom(table);
      return {
        upsert: (data: any, opts: any) => {
          mockUpsert(data, opts);
          return { error: null };
        }
      };
    },
  },
}));

// Mock API - we want to mock getProfile to control if a user "exists"
const mockGetProfile = vi.fn();
vi.mock('@/polymet/data/api', () => ({
  getProfile: (id: string) => mockGetProfile(id),
  signOut: vi.fn(),
}));

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

describe('CRITICAL AUTH FLOW', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('The Reader: useAuth Hook', () => {
    it('should initialize with no user', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

      const { result } = renderHook(() => useAuth());
      
      expect(result.current.isLoading).toBe(true);
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      
      expect(result.current.user).toBeNull();
    });

    it('should fetch profile when session exists', async () => {
      const mockSession = { user: { id: '123', email: 'test@example.com' } };
      const mockProfile = { id: '123', name: 'Test User' };
      
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(mockProfile);

      const { result } = renderHook(() => useAuth());
      
      await waitFor(() => {
        expect(result.current.user).toEqual(mockProfile);
      });
    });
  });

  describe('The Writer: AuthCallbackPage', () => {
    it('should redirect existing users immediately (no write)', async () => {
      // 1. Setup: User exists
      const mockSession = { user: { id: 'existing-user-id', email: 'test@example.com' } };
      const mockProfile = { id: 'existing-user-id', slug: 'existing-slug' };
      
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(mockProfile);

      // 2. Render
      render(
        <MemoryRouter>
          <AuthCallbackPage />
        </MemoryRouter>
      );

      // 3. Assertions
      await waitFor(() => {
        // Should NOT try to create a profile
        expect(mockUpsert).not.toHaveBeenCalled();
        // Should redirect to existing slug
        expect(mockNavigate).toHaveBeenCalledWith('/p/existing-slug', { replace: true });
      });
    });

    it('should create profile for NEW users (write)', async () => {
      // 1. Setup: User is new (getProfile returns null)
      const mockSession = { 
        user: { 
          id: 'new-user-id', 
          email: 'new@example.com',
          user_metadata: {
            name: 'New User',
            slug: 'new-user-slug',
            role: 'Developer'
          }
        } 
      };
      
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(null); // User does not exist yet

      // 2. Render
      render(
        <MemoryRouter>
          <AuthCallbackPage />
        </MemoryRouter>
      );

      // 3. Assertions
      await waitFor(() => {
        // Should call UPSERT to create the profile
        expect(mockUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'new-user-id',
            email: 'new@example.com',
            name: 'New User',
            slug: 'new-user-slug',
            is_verified: true
          }),
          { onConflict: 'id' }
        );

        // Should redirect to the NEW slug
        expect(mockNavigate).toHaveBeenCalledWith('/p/new-user-slug', { replace: true });
      });
    });
  });
});



