import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthCallbackPage, useAuth, AuthProvider } from '@/auth';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';

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
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        // Immediately fire the callback with current session state
        setTimeout(() => {
          mockGetSession().then((result: { data?: { session?: unknown } }) => {
            cb('INITIAL_SESSION', result.data?.session ?? null);
          });
        }, 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: (table: string) => {
      mockFrom(table);
      return {
        upsert: (data: unknown, opts: unknown) => {
          mockUpsert(data, opts);
          return { error: null };
        },
        update: (data: unknown) => {
          mockUpdate(data);
          return {
            eq: () => ({
              select: () => ({ data: [{ id: 'test' }], error: null })
            })
          };
        }
      };
    },
  },
}));

// Helper to extract upsert call data
const getUpsertData = () => {
  const calls = mockUpsert.mock.calls;
  return calls.length > 0 ? calls[0][0] : null;
};

// Mock API - we want to mock getProfile to control if a user "exists"
const mockGetProfile = vi.fn();
vi.mock('@/app/data/api', () => ({
  getProfile: (id: string) => mockGetProfile(id),
  signOut: vi.fn(),
  // generateSlug is now imported by AuthCallbackPage for slug generation at profile creation time
  generateSlug: (name: string) => name.toLowerCase().replace(/\s+/g, '-'),
}));

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

// Wrapper for hooks that need AuthProvider
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('CRITICAL AUTH FLOW', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('The Reader: useAuth Hook', () => {
    it('should initialize with no user', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for loading to complete (session check resolves)
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
    });

    it('should fetch profile when session exists', async () => {
      const mockSession = { user: { id: '123', email: 'test@example.com' } };
      const mockProfile = { id: '123', name: 'Test User' };

      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(mockProfile);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockProfile);
      });
    });
  });

  describe('The Writer: AuthCallbackPage', () => {
    it('should upsert existing users with FULL profile data and is_verified=true', async () => {
      // 1. Setup: User exists (profile was created by database trigger with is_verified=false)
      const mockSession = {
        user: {
          id: 'existing-user-id',
          email: 'test@example.com',
          user_metadata: {
            name: 'Existing User',
            // Note: slug is NOT in user_metadata anymore - it's generated at profile creation time
            role: 'Developer',
            linkedin_url: 'https://linkedin.com/in/existing',
            reason: 'To communicate better',
            avatar_color: '#FF5733'
          }
        }
      };
      const mockProfile = {
        id: 'existing-user-id',
        slug: 'existing-slug', // Existing user already has a slug in their profile
        name: 'Existing User',
        role: 'Developer',
        linkedinUrl: 'https://linkedin.com/in/existing',
        reason: 'To communicate better',
        avatarColor: '#FF5733'
      };

      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(mockProfile);

      // 2. Render
      render(
        <MemoryRouter>
          <AuthProvider>
            <AuthCallbackPage />
          </AuthProvider>
        </MemoryRouter>
      );

      // 3. Assertions - CRITICAL: Verify upsert is called with FULL profile data
      await waitFor(() => {
        expect(mockUpsert).toHaveBeenCalled();
        const upsertData = getUpsertData();

        // Verify ALL fields are included in upsert (not just is_verified)
        // For existing users, slug comes from the existing profile (user.slug)
        expect(upsertData).toMatchObject({
          id: 'existing-user-id',
          email: 'test@example.com',
          name: 'Existing User',
          slug: 'existing-slug', // From existing profile
          role: 'Developer',
          linkedin_url: 'https://linkedin.com/in/existing',
          reason: 'To communicate better',
          avatar_color: '#FF5733',
          is_verified: true
        });

        // Should redirect to existing slug
        expect(mockNavigate).toHaveBeenCalledWith('/p/existing-slug', { replace: true });
      });
    });

    it('should create profile for NEW users with FULL profile data from user_metadata', async () => {
      // 1. Setup: User is new (getProfile returns null)
      const mockSession = {
        user: {
          id: 'new-user-id',
          email: 'new@example.com',
          user_metadata: {
            name: 'New User',
            // Note: slug is NOT in user_metadata - it's generated at profile creation time from the name
            role: 'Designer',
            linkedin_url: 'https://linkedin.com/in/newuser',
            reason: 'I want to be clearer',
            avatar_color: '#3366FF'
          }
        }
      };

      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(null); // User does not exist yet

      // 2. Render
      render(
        <MemoryRouter>
          <AuthProvider>
            <AuthCallbackPage />
          </AuthProvider>
        </MemoryRouter>
      );

      // 3. Assertions - CRITICAL: Verify upsert creates profile with ALL fields from metadata
      await waitFor(() => {
        expect(mockUpsert).toHaveBeenCalled();
        const upsertData = getUpsertData();

        // Verify profile is created with ALL fields from user_metadata
        // Slug is now generated at profile creation time from the name ("New User" -> "new-user")
        // This prevents race conditions where multiple users with the same name sign up simultaneously
        expect(upsertData).toMatchObject({
          id: 'new-user-id',
          email: 'new@example.com',
          name: 'New User',
          slug: 'new-user', // Generated from name at creation time
          role: 'Designer',
          linkedin_url: 'https://linkedin.com/in/newuser',
          reason: 'I want to be clearer',
          avatar_color: '#3366FF',
          is_verified: true
        });

        // Should redirect to the generated slug
        expect(mockNavigate).toHaveBeenCalledWith('/p/new-user', { replace: true });
      });
    });
  });
});
