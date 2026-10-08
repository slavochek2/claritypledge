/**
 * P1441: the post-signup callback runs its one-time work ONCE, and an auto-RSVP that cannot be
 * sent as the new user asks them to sign in again (keeping the RSVP intent) instead of failing
 * silently.
 *
 * Prod (Sentry JAVASCRIPT-REACT-3Q breadcrumbs): processAuth ran twice for one signup — two
 * upsert_my_profile, two mark_self_verified, two auto-RSVP inserts, and BOTH profile_created
 * and login_complete tracked — because the effect re-runs whenever `user`/`session` change and
 * refreshProfile() itself changes `user`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthCallbackPage, AuthProvider } from '@/auth';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// MOCKS (mirrors critical-auth-flow.test.tsx harness)
// -----------------------------------------------------------------------------

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockGetSession = vi.fn();
const mockUpsert = vi.fn();
const mockProfileByEmail = vi.fn();    // /live migration lookup (get_my_profile_by_email RPC)

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        setTimeout(() => {
          mockGetSession().then((result: { data?: { session?: unknown } }) => {
            cb('INITIAL_SESSION', result.data?.session ?? null);
          });
        }, 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    rpc: (fn: string, params: { p_data?: unknown }) => {
      if (fn === 'upsert_my_profile') {
        mockUpsert(params?.p_data, undefined);
        return mockUpsert.mock.results[mockUpsert.mock.calls.length - 1]?.value ?? { error: null };
      }
      if (fn === 'get_my_profile_by_email') {
        return mockProfileByEmail();
      }
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: null }),
          maybeSingle: () => ({ data: null, error: null }),
          // /live migration path checks witnesses: .eq('profile_id', id).limit(1)
          limit: () => ({ data: [], error: null }),
        }),
        or: () => ({ data: [], error: null }),
      }),
      update: () => ({ eq: () => ({ select: () => ({ data: [{ id: 'test' }], error: null }) }) }),
      delete: () => ({ eq: () => ({ error: null }) }),
    }),
  },
}));

// Context (getProfileResult) and page (getProfile) are mocked SEPARATELY —
// the bug lives exactly in their divergence: context fetch fails, page fetch succeeds.
const mockGetProfile = vi.fn();        // page-level fallback (AuthCallbackPage.tsx:110)
const mockGetProfileResult = vi.fn();  // context fetch (AuthContext fetchProfileForUser)
const mockMarkSelfVerified = vi.fn().mockResolvedValue({ verified: true, error: null });
const mockSetMyPledge = vi.fn().mockResolvedValue({ applied: true, error: null });
// P1093: AuthCallbackPage replays staged letter positions once the caller is verified.
const mockReplayLetterPositions = vi.fn().mockResolvedValue({ replayed: 0, error: null });
const mockGetEventBySlug = vi.fn();
const mockApiSignOut = vi.fn().mockResolvedValue(undefined);
const mockRsvpToEvent = vi.fn();
vi.mock('@/app/data/api', () => ({
  getProfile: (id: string) => mockGetProfile(id),
  getProfileResult: (id: string) => mockGetProfileResult(id),
  signOut: (opts?: unknown) => mockApiSignOut(opts),
  // P985: AuthCallbackPage romanizes the slug via slugifyName (async, lazy transliteration).
  slugifyName: async (name: string) => name.toLowerCase().replace(/\s+/g, '-'),
  markSelfVerified: () => mockMarkSelfVerified(),
  setMyPledge: (pledged: boolean) => mockSetMyPledge(pledged),
  replayLetterPositions: () => mockReplayLetterPositions(),
  getEventBySlug: (slug: string) => mockGetEventBySlug(slug),
  rsvpToEvent: (eventId: string, profileId: string) => mockRsvpToEvent(eventId, profileId),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (m: string) => mockToastError(m), success: vi.fn() } }));

// Spy on analytics — the assertion target. AuthContext also imports identify/reset.
const mockTrack = vi.fn();
const mockSetUserProperties = vi.fn();
vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: (event: string, props?: unknown) => mockTrack(event, props),
    identify: vi.fn(),
    setUserProperties: (props?: unknown) => mockSetUserProperties(props),
    reset: vi.fn(),
  },
  // P1133: AuthCallbackPage also imports isInternalAccount — stub it so the
  // module shape matches. Real setUserProperties({is_internal}) wiring (not
  // isInternalAccount's own internal logic, covered elsewhere) is asserted
  // below via mockSetUserProperties.
  isInternalAccount: vi.fn(() => false),
}));

const NEW_ID = 'new-user-id-1441';
const newSession = {
  user: { id: NEW_ID, email: 'new1441@example.com', user_metadata: { name: 'New Person' } },
};
const newProfile = { id: NEW_ID, slug: 'new-person', name: 'New Person', hasPledged: false };

function renderCallback(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <AuthCallbackPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

const RSVP_URL = '/auth/callback?source=signup&redirect=%2Fevents%2Fhike-1&action=rsvp';

describe('P1441: auth callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkSelfVerified.mockResolvedValue({ verified: true, error: null });
    mockSetMyPledge.mockResolvedValue({ applied: true, error: null });
    mockProfileByEmail.mockReturnValue({ data: null, error: null });
    mockGetSession.mockResolvedValue({ data: { session: newSession }, error: null });
    // Context: no profile on first load, the created profile after refreshProfile().
    mockGetProfileResult
      .mockResolvedValueOnce({ success: false, error: 'not_found' })
      .mockResolvedValue({ success: true, data: newProfile });
    mockGetProfile.mockResolvedValue(null);
    mockGetEventBySlug.mockResolvedValue({ id: 'evt-1', slug: 'hike-1' });
    mockRsvpToEvent.mockResolvedValue(true);
    sessionStorage.clear();
  });

  it('runs the signup work once, even after refreshProfile() changes the user', async () => {
    renderCallback('/auth/callback?source=signup');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 300));
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockMarkSelfVerified).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('profile_created', expect.anything());
    expect(mockTrack).not.toHaveBeenCalledWith('login_complete', expect.anything());
  });

  it('auto-RSVPs once and lands on the confirmation page', async () => {
    renderCallback(RSVP_URL);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/hike-1/confirm', { replace: true }));
    await new Promise((r) => setTimeout(r, 300));
    expect(mockRsvpToEvent).toHaveBeenCalledTimes(1);
  });

  it('a lost session asks the person to sign in again and keeps the RSVP intent', async () => {
    const { SessionMismatchError } = await import('@/lib/session-guard');
    // The prod shape: the client has lost the session by the time the RSVP is attempted.
    mockRsvpToEvent.mockImplementation(async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      throw new SessionMismatchError(NEW_ID);
    });
    renderCallback(RSVP_URL);
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/login?redirect=%2Fevents%2Fhike-1&action=rsvp', { replace: true }),
    );
    expect(mockToastError).toHaveBeenCalledWith('Please sign in again to reserve your seat.');
    expect(mockNavigate).not.toHaveBeenCalledWith('/events/hike-1/confirm', expect.anything());
    expect(mockApiSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('a client signed in as SOMEONE ELSE is never signed out — the page reloads as that person', async () => {
    const { SessionMismatchError } = await import('@/lib/session-guard');
    const assign = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, assign } });
    try {
      mockRsvpToEvent.mockImplementation(async () => {
        mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'another-account' } } }, error: null });
        throw new SessionMismatchError(NEW_ID);
      });
      renderCallback(RSVP_URL);
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/events/hike-1'));
      expect(mockApiSignOut).not.toHaveBeenCalled();
      expect(mockToastError).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    }
  });
});
