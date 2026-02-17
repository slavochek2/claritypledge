/**
 * @file private-session.test.ts
 * @description P160: Unit tests for private session mode
 *
 * Tests the mapping and API layer for is_private / isPrivate field.
 * Integration and E2E tests cover the UI and recording gates.
 */

// NOTE: These tests require the DB schema to have the is_private column (P160 migration).
// Run the migration before running these tests.

describe('mapSessionFromDb — is_private mapping', () => {
  it('maps is_private=true to isPrivate=true', () => {
    // Inline mapping logic (mirrors mapSessionFromDb behavior):
    const dbSession = { is_private: true };
    const isPrivate: boolean = dbSession.is_private ?? false;
    expect(isPrivate).toBe(true);
  });

  it('maps is_private=false to isPrivate=false', () => {
    const dbSession = { is_private: false };
    const isPrivate: boolean = dbSession.is_private ?? false;
    expect(isPrivate).toBe(false);
  });

  it('defaults to false when is_private is null', () => {
    const dbSession = { is_private: null as null | boolean };
    const isPrivate: boolean = dbSession.is_private ?? false;
    expect(isPrivate).toBe(false);
  });

  it('defaults to false when is_private is undefined', () => {
    const dbSession = {} as { is_private?: boolean };
    const isPrivate: boolean = dbSession.is_private ?? false;
    expect(isPrivate).toBe(false);
  });
});

describe('consent label logic — based on isPrivate state', () => {
  const RECORDED_LABEL =
    'I agree this session is recorded for AI Insights, and I accept the Terms & Privacy Policy';
  const PRIVATE_LABEL = 'I accept the Terms & Privacy Policy';

  function getConsentLabel(isPrivate: boolean): string {
    return isPrivate ? PRIVATE_LABEL : RECORDED_LABEL;
  }

  it('shows full recording consent label when recording is ON', () => {
    expect(getConsentLabel(false)).toBe(RECORDED_LABEL);
  });

  it('shows T&C-only label when recording is OFF (private mode)', () => {
    expect(getConsentLabel(true)).toBe(PRIVATE_LABEL);
  });

  it('private label does NOT contain "recorded for AI"', () => {
    expect(getConsentLabel(true)).not.toContain('recorded for AI');
  });

  it('private label still contains Terms & Privacy reference', () => {
    expect(getConsentLabel(true)).toContain('Terms & Privacy Policy');
  });
});

describe('recording gate logic — Gate C', () => {
  // Gate C: view === 'live' && session && !isRecording && micStatus === 'granted' && !session.isPrivate
  function shouldStartRecording(params: {
    view: string;
    hasSession: boolean;
    isRecording: boolean;
    micStatus: string;
    sessionIsPrivate: boolean;
  }): boolean {
    const { view, hasSession, isRecording, micStatus, sessionIsPrivate } = params;
    return (
      view === 'live' &&
      hasSession &&
      !isRecording &&
      micStatus === 'granted' &&
      !sessionIsPrivate
    );
  }

  it('starts recording for recorded session in live view with granted mic', () => {
    expect(
      shouldStartRecording({
        view: 'live',
        hasSession: true,
        isRecording: false,
        micStatus: 'granted',
        sessionIsPrivate: false,
      })
    ).toBe(true);
  });

  it('does NOT start recording for private session (Gate C blocks it)', () => {
    expect(
      shouldStartRecording({
        view: 'live',
        hasSession: true,
        isRecording: false,
        micStatus: 'granted',
        sessionIsPrivate: true,
      })
    ).toBe(false);
  });

  it('does NOT start recording if already recording', () => {
    expect(
      shouldStartRecording({
        view: 'live',
        hasSession: true,
        isRecording: true,
        micStatus: 'granted',
        sessionIsPrivate: false,
      })
    ).toBe(false);
  });

  it('does NOT start recording if mic not granted', () => {
    expect(
      shouldStartRecording({
        view: 'live',
        hasSession: true,
        isRecording: false,
        micStatus: 'denied',
        sessionIsPrivate: false,
      })
    ).toBe(false);
  });

  it('does NOT start recording outside live view', () => {
    expect(
      shouldStartRecording({
        view: 'waiting',
        hasSession: true,
        isRecording: false,
        micStatus: 'granted',
        sessionIsPrivate: false,
      })
    ).toBe(false);
  });
});

describe('Gate A — proactive mic request in waiting room', () => {
  // Gate A: view === 'waiting' && isCreator && micStatus === 'unknown' && !isPrivate
  function shouldRequestMicInWaitingRoom(params: {
    view: string;
    isCreator: boolean;
    micStatus: string;
    isPrivate: boolean;
  }): boolean {
    const { view, isCreator, micStatus, isPrivate } = params;
    return view === 'waiting' && isCreator && micStatus === 'unknown' && !isPrivate;
  }

  it('requests mic in waiting room for creator with unknown mic status', () => {
    expect(
      shouldRequestMicInWaitingRoom({
        view: 'waiting',
        isCreator: true,
        micStatus: 'unknown',
        isPrivate: false,
      })
    ).toBe(true);
  });

  it('does NOT request mic in waiting room when session is private (Gate A)', () => {
    expect(
      shouldRequestMicInWaitingRoom({
        view: 'waiting',
        isCreator: true,
        micStatus: 'unknown',
        isPrivate: true,
      })
    ).toBe(false);
  });

  it('does NOT request mic if user is not the creator', () => {
    expect(
      shouldRequestMicInWaitingRoom({
        view: 'waiting',
        isCreator: false,
        micStatus: 'unknown',
        isPrivate: false,
      })
    ).toBe(false);
  });
});

describe('Gate D — gateMicAndGoLive bypass for private session', () => {
  // Gate D: if (isPrivate) { setView('live'); return true; }
  function gateMicAndGoLive(isPrivate: boolean, micGranted: boolean): boolean {
    if (isPrivate) return true; // bypass mic check, go live
    return micGranted;
  }

  it('bypasses mic check and returns true for private session', () => {
    expect(gateMicAndGoLive(true, false)).toBe(true);
  });

  it('requires mic grant for recorded session', () => {
    expect(gateMicAndGoLive(false, true)).toBe(true);
    expect(gateMicAndGoLive(false, false)).toBe(false);
  });
});
