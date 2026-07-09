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
    // P877: AuthCallbackPage now writes the own profile via the upsert_my_profile
    // SECURITY DEFINER accessor, and reads the /live-migration profile via
    // get_my_profile_by_email — both go through .rpc(), not .from().upsert()/.select().
    rpc: (fn: string, params: { p_data?: unknown }) => {
      if (fn === 'upsert_my_profile') {
        // Route through mockUpsert so getUpsertData() + slug-retry config still apply.
        mockUpsert(params?.p_data, undefined);
        return mockUpsert.mock.results[mockUpsert.mock.calls.length - 1]?.value ?? { error: null };
      }
      // get_my_profile_by_email (and any other accessor): default no row.
      return { data: null, error: null };
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
            eq: () => ({
              single: () => ({ data: null, error: null }), // Default: no profile found by email
              // P832: AuthCallbackPage queries existing accepted_terms_version
              // to preserve it across logins. Default: no existing row.
              maybeSingle: () => ({ data: null, error: null }),
            }),
            or: (filter: string) => {
              mockOr(filter);
              // Return configured similar slugs (default: empty)
              return mockOr.mock.results[mockOr.mock.calls.length - 1]?.value ?? { data: [], error: null };
            }
          };
        },
        delete: () => ({
          eq: () => ({ error: null }), // Default: delete succeeds
        })
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
// P880: AuthCallbackPage sets the server-controlled trust columns (is_verified /
// has_pledged) through these accessors AFTER the upsert. Exposed so tests can assert the
// upsert no longer carries trust columns and the accessors are called with the right
// pledge value. clearAllMocks() (beforeEach) keeps these implementations.
const mockMarkSelfVerified = vi.fn().mockResolvedValue({ verified: true, error: null });
const mockSetMyPledge = vi.fn().mockResolvedValue({ applied: true, error: null });
vi.mock('@/app/data/api', () => ({
  getProfile: (id: string) => mockGetProfile(id),
  getProfileResult: (id: string) => mockGetProfile(id).then((data: unknown) => ({ success: true, data })).catch(() => ({ success: false, data: null })),
  signOut: vi.fn(),
  // P985: AuthCallbackPage romanizes the slug via slugifyName (async, lazy transliteration)
  slugifyName: async (name: string) => name.toLowerCase().replace(/\s+/g, '-'),
  markSelfVerified: () => mockMarkSelfVerified(),
  setMyPledge: (pledged: boolean) => mockSetMyPledge(pledged),
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
        // P880: is_verified / has_pledged are NO LONGER part of the upsert payload —
        // they are set afterwards via the server-controlled accessors.
        expect(upsertData).toMatchObject({
          id: 'existing-user-id',
          email: 'test@example.com',
          name: 'Existing User',
          slug: 'existing-slug', // From existing profile
          role: 'Developer',
          linkedin_url: 'https://linkedin.com/in/existing',
          reason: 'To communicate better',
          avatar_color: '#FF5733',
        });
        expect(upsertData.is_verified).toBeUndefined();
        expect(upsertData.has_pledged).toBeUndefined();
        // Verification + pledge state now flow through the dedicated accessors.
        // No source param = login: existing user with no stored pledge → not pledged.
        expect(mockMarkSelfVerified).toHaveBeenCalled();
        expect(mockSetMyPledge).toHaveBeenCalledWith(false);

        // P62: Should redirect to dashboard
        expect(mockNavigate).toHaveBeenCalledWith('/feed', { replace: true });
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

      // 2. Render - P64: Must include source=pledge to create profile (otherwise redirects to signup)
      render(
        <MemoryRouter initialEntries={['/auth/callback?source=pledge']}>
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
        // P880: trust columns are set via the accessors, not the upsert payload.
        expect(upsertData).toMatchObject({
          id: 'new-user-id',
          email: 'new@example.com',
          name: 'New User',
          slug: 'new-user', // Generated from name at creation time
          role: 'Designer',
          linkedin_url: 'https://linkedin.com/in/newuser',
          reason: 'I want to be clearer',
          avatar_color: '#3366FF',
        });
        expect(upsertData.is_verified).toBeUndefined();
        // source=pledge → new pledger: verified then pledged via the accessors.
        expect(mockMarkSelfVerified).toHaveBeenCalled();
        expect(mockSetMyPledge).toHaveBeenCalledWith(true);

        // P62: Should redirect to dashboard
        expect(mockNavigate).toHaveBeenCalledWith('/feed', { replace: true });
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

      // P64: Must include source=pledge to create profile (otherwise redirects to signup)
      render(
        <MemoryRouter initialEntries={['/auth/callback?source=pledge']}>
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
        // P62: Redirects to dashboard
        expect(mockNavigate).toHaveBeenCalledWith('/feed', { replace: true });
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

      // P64: Must include source=pledge to create profile (otherwise redirects to signup)
      render(
        <MemoryRouter initialEntries={['/auth/callback?source=pledge']}>
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
        // P62: Redirects to dashboard
        expect(mockNavigate).toHaveBeenCalledWith('/feed', { replace: true });
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

      // P64: Must include source=pledge to test email validation path
      // (without source, would redirect to signup before reaching email check)
      const { container } = render(
        <MemoryRouter initialEntries={['/auth/callback?source=pledge']}>
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

    it('Option B: should create account when Google login attempt has no existing account', async () => {
      // Google = sign in OR sign up — no redirect, just create the account
      const mockSession = {
        user: {
          id: 'new-user-id',
          email: 'new@example.com',
          user_metadata: {
            name: 'New User',
          }
        }
      };

      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(null); // No existing account

      // No source parameter = login flow (e.g. Google button on login page)
      render(
        <MemoryRouter initialEntries={['/auth/callback']}>
          <AuthProvider>
            <AuthCallbackPage />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Should create profile (not redirect away)
        expect(mockUpsert).toHaveBeenCalled();
        const upsertData = getUpsertData();
        // P880: New user via login page: not pledged (they haven't signed the pledge).
        // The upsert no longer carries trust columns; the accessors apply them.
        expect(upsertData.has_pledged).toBeUndefined();
        expect(upsertData.is_verified).toBeUndefined();
        expect(mockMarkSelfVerified).toHaveBeenCalled();
        expect(mockSetMyPledge).toHaveBeenCalledWith(false);
        // Should redirect to dashboard, not signup
        expect(mockNavigate).toHaveBeenCalledWith('/feed', { replace: true });
      });
    });

    it('P64: should create profile with has_pledged=false for signup flow', async () => {
      // Setup: User signing up (not pledging)
      const mockSession = {
        user: {
          id: 'new-user-id',
          email: 'new@example.com',
          user_metadata: {
            name: 'New User',
          }
        }
      };

      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockGetProfile.mockResolvedValue(null);

      // source=signup for standalone account creation
      render(
        <MemoryRouter initialEntries={['/auth/callback?source=signup']}>
          <AuthProvider>
            <AuthCallbackPage />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockUpsert).toHaveBeenCalled();
        const upsertData = getUpsertData();
        // P64 + P880: signup flow creates an un-pledged account; the pledge state is
        // applied via set_my_pledge(false), not the upsert payload.
        expect(upsertData.has_pledged).toBeUndefined();
        expect(mockSetMyPledge).toHaveBeenCalledWith(false);
        expect(mockMarkSelfVerified).toHaveBeenCalled();
        // Should redirect to dashboard
        expect(mockNavigate).toHaveBeenCalledWith('/feed', { replace: true });
      });
    });
  });
});

