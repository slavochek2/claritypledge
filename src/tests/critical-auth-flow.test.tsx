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
const mockSelect = vi.fn();
const mockOr = vi.fn();

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
          // Return the configured upsert response (default: success)
          return mockUpsert.mock.results[mockUpsert.mock.calls.length - 1]?.value ?? { error: null };
        },
        update: (data: unknown) => {
          mockUpdate(data);
          return {
            eq: () => ({
              select: () => ({ data: [{ id: 'test' }], error: null })
            })
          };
        },
        select: (fields: string) => {
          mockSelect(fields);
          return {
            or: (filter: string) => {
              mockOr(filter);
              // Return configured similar slugs (default: empty)
              return mockOr.mock.results[mockOr.mock.calls.length - 1]?.value ?? { data: [], error: null };
            }
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

    it('should retry with sequential slug on conflict (john-doe-2)', async () => {
      // Setup: New user with name that already exists
      const mockSession = {
        user: {
          id: 'new-user-id',
          email: 'new@example.com',
          user_metadata: {
            name: 'John Doe',
            role: 'Designer',
          }
        }
      };

      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(null);

      // First upsert fails with slug conflict, second succeeds
      mockUpsert
        .mockReturnValueOnce({ error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_slug_key"' } })
        .mockReturnValueOnce({ error: null });

      // Return existing slugs for query
      mockOr.mockReturnValueOnce({ data: [{ slug: 'john-doe' }], error: null });

      render(
        <MemoryRouter>
          <AuthProvider>
            <AuthCallbackPage />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockUpsert).toHaveBeenCalledTimes(2);
        // Second call should have slug with -2 suffix
        const secondCall = mockUpsert.mock.calls[1][0];
        expect(secondCall.slug).toBe('john-doe-2');
        expect(mockNavigate).toHaveBeenCalledWith('/p/john-doe-2', { replace: true });
      });
    });

    it('should use timestamp fallback after max retries exhausted', async () => {
      // Setup: New user
      const mockSession = {
        user: {
          id: 'new-user-id',
          email: 'new@example.com',
          user_metadata: {
            name: 'Popular Name',
            role: 'Designer',
          }
        }
      };

      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(null);

      // Mock Date.now for predictable timestamp BEFORE any renders
      const mockTimestamp = 1733270400000;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

      // All 3 retries fail, then timestamp fallback succeeds
      const slugError = { code: '23505', message: 'duplicate key value violates unique constraint "profiles_slug_key"' };

      // Configure upsert to return error for first 3 calls, then success
      let upsertCallCount = 0;
      mockUpsert.mockImplementation(() => {
        upsertCallCount++;
        // First 3 calls fail with slug error, 4th succeeds (timestamp fallback)
        if (upsertCallCount <= 3) {
          return { error: slugError };
        }
        return { error: null };
      });

      // Return existing slugs each time - these cover 2, 3, 4
      mockOr.mockReturnValue({
        data: [
          { slug: 'popular-name' },
          { slug: 'popular-name-2' },
          { slug: 'popular-name-3' },
          { slug: 'popular-name-4' }
        ],
        error: null
      });

      render(
        <MemoryRouter>
          <AuthProvider>
            <AuthCallbackPage />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Should have attempted: initial + 3 retries (in while loop) + 1 timestamp fallback = 4 calls
        expect(mockUpsert).toHaveBeenCalledTimes(4);
        // Final call should have timestamp slug
        const finalCall = mockUpsert.mock.calls[3][0];
        expect(finalCall.slug).toBe(`popular-name-${mockTimestamp}`);
        expect(mockNavigate).toHaveBeenCalledWith(`/p/popular-name-${mockTimestamp}`, { replace: true });
      });

      vi.restoreAllMocks();
    });

    it('should show error when auth user has no email', async () => {
      // Setup: User with no email (edge case)
      const mockSession = {
        user: {
          id: 'no-email-user',
          email: null, // No email!
          user_metadata: {
            name: 'No Email User',
          }
        }
      };

      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(null);

      const { container } = render(
        <MemoryRouter>
          <AuthProvider>
            <AuthCallbackPage />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Should NOT call upsert
        expect(mockUpsert).not.toHaveBeenCalled();
        // Should show error status
        expect(container.textContent).toContain('No email found');
      });
    });
  });
});






