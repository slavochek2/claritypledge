/**
 * P1529: signing up from the event page of a flow that asks its questions before the seat. The callback must not try to
 * seat the new person (the server refuses a seat without the answers, which only logs a failure); it sends them back to
 * the event page with the sign-up marker, where the registration step opens. Every other event is auto-RSVPed as before.
 * Harness copied from p1441-auth-callback.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthCallbackPage, AuthProvider } from '@/auth';
import { MemoryRouter } from 'react-router-dom';
import { readRegistrationDraft, saveRegistrationDraft } from '@/app/data/registration-draft';
import type { RegistrationAnswers } from '@/app/data/registration-answer-model';

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
  consumePendingTermsAcceptance: () => Promise.resolve(),
  getEventBySlug: (slug: string) => mockGetEventBySlug(slug),
  rsvpToEvent: (eventId: string, profileId: string) => mockRsvpToEvent(eventId, profileId),
}));

const mockAsksBeforeSeat = vi.fn();
const mockRegisterFor = vi.fn();
vi.mock('@/app/data/event-registration', () => ({
  eventAsksBeforeSeat: (slug: string) => mockAsksBeforeSeat(slug),
  registerForEvent: (event: unknown, profileId: string, answers: unknown) => mockRegisterFor(event, profileId, answers),
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


const RSVP_URL = '/auth/callback?source=signup&redirect=%2Fevents%2Fnight-1&action=rsvp';

describe('P1529: the sign-up return for a flow that asks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkSelfVerified.mockResolvedValue({ verified: true, error: null });
    mockSetMyPledge.mockResolvedValue({ applied: true, error: null });
    mockProfileByEmail.mockReturnValue({ data: null, error: null });
    mockGetSession.mockResolvedValue({ data: { session: newSession }, error: null });
    mockGetProfileResult
      .mockResolvedValueOnce({ success: false, error: 'not_found' })
      .mockResolvedValue({ success: true, data: newProfile });
    mockGetProfile.mockResolvedValue(null);
    mockGetEventBySlug.mockResolvedValue({ id: 'evt-1', slug: 'night-1' });
    mockRsvpToEvent.mockResolvedValue(true);
    mockAsksBeforeSeat.mockResolvedValue(false);
    mockRegisterFor.mockResolvedValue('ok');
    sessionStorage.clear();
    localStorage.clear();
  });

  it('does not try to seat the person: it goes back to the event page, where the step opens', async () => {
    mockAsksBeforeSeat.mockResolvedValue(true);
    renderCallback(RSVP_URL);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/night-1?action=rsvp', { replace: true }));
    await new Promise((r) => setTimeout(r, 200));
    expect(mockRsvpToEvent).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith('/events/night-1/confirm', expect.anything());
  });

  it('keeps Clarity Night one tap: it still auto-RSVPs and lands on the confirmation', async () => {
    renderCallback(RSVP_URL);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/night-1/confirm', { replace: true }));
    expect(mockRsvpToEvent).toHaveBeenCalledTimes(1);
  });

  it('a failed read of the flow does not block the RSVP', async () => {
    mockAsksBeforeSeat.mockRejectedValue(new Error('offline'));
    renderCallback(RSVP_URL);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/night-1/confirm', { replace: true }));
  });

  describe('D24: answers saved before sign-up', () => {
    const SAVED: RegistrationAnswers = { participation: 'observer', observerPrep: 'home', phone: 'lightning', hope: '', recordingAccepted: true };

    it('registers with them, clears them, and lands on the confirm screen, without the one-tap seat', async () => {
      mockAsksBeforeSeat.mockResolvedValue(true);
      saveRegistrationDraft('night-1', 'register', SAVED);
      renderCallback(RSVP_URL);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/night-1/confirm', { replace: true }));
      expect(mockRegisterFor).toHaveBeenCalledTimes(1);
      expect(mockRegisterFor).toHaveBeenCalledWith({ id: 'evt-1', slug: 'night-1' }, NEW_ID, SAVED);
      expect(mockRsvpToEvent).not.toHaveBeenCalled();
      expect(readRegistrationDraft('night-1')).toBeNull();
      expect(mockTrack).toHaveBeenCalledWith('event_rsvp_auto', expect.objectContaining({ event_slug: 'night-1' }));
    });

    it('never sends answers saved for a different event', async () => {
      mockAsksBeforeSeat.mockResolvedValue(true);
      saveRegistrationDraft('night-2', 'register', SAVED);
      renderCallback(RSVP_URL);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/night-1?action=rsvp', { replace: true }));
      expect(mockRegisterFor).not.toHaveBeenCalled();
      expect(readRegistrationDraft('night-2')).not.toBeNull();
    });

    it('the event filled meanwhile: the person goes to the page, the answers stay, nothing is confirmed', async () => {
      mockAsksBeforeSeat.mockResolvedValue(true);
      mockRegisterFor.mockResolvedValue('full');
      saveRegistrationDraft('night-1', 'register', SAVED);
      renderCallback(RSVP_URL);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/night-1?action=rsvp', { replace: true }));
      expect(readRegistrationDraft('night-1')).not.toBeNull();
      expect(mockNavigate).not.toHaveBeenCalledWith('/events/night-1/confirm', expect.anything());
    });

    it('a saved waiting-list request is for the page to act on: the callback registers nobody', async () => {
      mockAsksBeforeSeat.mockResolvedValue(true);
      saveRegistrationDraft('night-1', 'waitlist', SAVED);
      renderCallback(RSVP_URL);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/night-1?action=rsvp', { replace: true }));
      expect(mockRegisterFor).not.toHaveBeenCalled();
      expect(readRegistrationDraft('night-1')).not.toBeNull();
    });

    it('a flow that does not ask ignores any saved answers and keeps its one tap', async () => {
      saveRegistrationDraft('night-1', 'register', SAVED);
      renderCallback(RSVP_URL);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/night-1/confirm', { replace: true }));
      expect(mockRegisterFor).not.toHaveBeenCalled();
      expect(mockRsvpToEvent).toHaveBeenCalledTimes(1);
    });
  });
});

describe('P1529 D24: the callback running a second time for one sign-in', () => {
  it('sends someone already registered to confirm, not back to the form', async () => {
    const src = (await import('node:fs')).readFileSync('src/auth/auto-rsvp-destination.ts', 'utf8');
    expect(src).toMatch(/isUserRsvpd\(event\.id, userId\)/);
    expect(src).toMatch(/registered \? `\/events\/\$\{eventSlug\}\/confirm` : toPage/);
  });
});
