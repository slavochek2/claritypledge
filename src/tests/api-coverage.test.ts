/**
 * @file api-coverage.test.ts
 * Unit tests for untested logic in api.ts
 *
 * Functions covered:
 * - validateContentLength (exported pure function)
 * - Exported constants (MAX_* limits, avatar limits)
 * - getFeedSessionId / getFeedUserName / setFeedUserName (localStorage helpers)
 * - isPrivateBrowsingMode (localStorage fallback detection)
 * - mapSessionFromDb (private, exercised via getClaritySession)
 * - mapDemoRoundFromDb (private, exercised via getDemoRounds)
 * - mapClarityIdeaFromDb (private, exercised via getClarityIdeas)
 * - mapChatMessageFromDb (private, exercised via getChatMessages)
 * - mapVerificationFromDb (private, exercised via getVerificationsForMessage)
 * - mapEventFromDb / mapEventWithHostFromDb (private, exercised via getEventBySlug)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before any import that loads api.ts.
// vi.mock() is hoisted by Vitest so this runs before all imports below.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    channel: vi.fn(),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import {
  validateContentLength,
  MAX_IDEA_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_PARAPHRASE_LENGTH,
  MAX_CORRECTION_LENGTH,
  MAX_FEATURED_PROFILES,
  AVATAR_ROW_LIMIT_MOBILE,
  AVATAR_ROW_LIMIT_DESKTOP,
  getFeedSessionId,
  getFeedUserName,
  setFeedUserName,
  isPrivateBrowsingMode,
  getClaritySession,
  getDemoRounds,
  getClarityIdeas,
  getChatMessages,
  getVerificationsForMessage,
  getEventBySlug,
  extractErrorDetail,
} from '@/app/data/api';

// ─────────────────────────────────────────────────────────────────────────────
// Supabase fluent-API chain mock helpers.
// Each function returns an object that mimics the Supabase query builder chain
// for a specific call pattern, resolving to `result` at the terminal method.
// ─────────────────────────────────────────────────────────────────────────────

/** select → eq → maybeSingle() → Promise */
// P1057: makeMaybeSingleChain removed — its only remaining consumers were the
// getClaritySession tests, and that read now goes through supabase.rpc rather than a
// select → eq → maybeSingle chain. Left as a comment rather than dead code so the next
// reader does not resurrect the old transport shape.

/** select → eq → order → order → Promise (two consecutive .order() calls) */
function makeDoubleOrderChain(result: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

/** select → eq → order → Promise (one .order() call) */
function makeSingleOrderChain(result: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

/** select → eq → single() → Promise */
function makeSingleChain(result: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── validateContentLength ───────────────────────────────────────────────────

describe('validateContentLength', () => {
  it('returns trimmed content when within limit', () => {
    const result = validateContentLength('  hello world  ', 100, 'Test');
    expect(result).toBe('hello world');
  });

  it('throws when trimmed content exceeds max length', () => {
    const longContent = 'a'.repeat(101);
    expect(() => validateContentLength(longContent, 100, 'Idea')).toThrow(
      'Idea exceeds maximum length of 100 characters (got 101)'
    );
  });

  it('accepts content exactly at the limit without throwing', () => {
    const content = 'a'.repeat(100);
    expect(() => validateContentLength(content, 100, 'Test')).not.toThrow();
    expect(validateContentLength(content, 100, 'Test')).toBe(content);
  });

  it('trims whitespace before checking length — padding does not count toward limit', () => {
    // Surrounding spaces take the raw string to 102 chars, but trimmed = 100 exactly
    const content = ' ' + 'a'.repeat(100) + ' ';
    expect(() => validateContentLength(content, 100, 'Test')).not.toThrow();
  });

  it('error message includes field name and actual trimmed length', () => {
    const overLimit = 'x'.repeat(6);
    expect(() => validateContentLength(overLimit, 5, 'Comment')).toThrow(
      'Comment exceeds maximum length of 5 characters (got 6)'
    );
  });
});

// ─── Exported constants ───────────────────────────────────────────────────────

describe('Exported constants', () => {
  it('MAX_IDEA_LENGTH is 5000', () => {
    expect(MAX_IDEA_LENGTH).toBe(5000);
  });

  it('MAX_COMMENT_LENGTH is 2000 and smaller than MAX_IDEA_LENGTH', () => {
    expect(MAX_COMMENT_LENGTH).toBe(2000);
    expect(MAX_COMMENT_LENGTH).toBeLessThan(MAX_IDEA_LENGTH);
  });

  it('MAX_CHAT_MESSAGE_LENGTH equals MAX_IDEA_LENGTH', () => {
    expect(MAX_CHAT_MESSAGE_LENGTH).toBe(MAX_IDEA_LENGTH);
  });

  it('MAX_NAME_LENGTH is 100', () => {
    expect(MAX_NAME_LENGTH).toBe(100);
  });

  it('MAX_PARAPHRASE_LENGTH equals MAX_COMMENT_LENGTH', () => {
    expect(MAX_PARAPHRASE_LENGTH).toBe(MAX_COMMENT_LENGTH);
  });

  it('MAX_CORRECTION_LENGTH is 1000 and smaller than MAX_COMMENT_LENGTH', () => {
    expect(MAX_CORRECTION_LENGTH).toBe(1000);
    expect(MAX_CORRECTION_LENGTH).toBeLessThan(MAX_COMMENT_LENGTH);
  });

  it('AVATAR_ROW_LIMIT_DESKTOP is greater than AVATAR_ROW_LIMIT_MOBILE', () => {
    expect(AVATAR_ROW_LIMIT_DESKTOP).toBeGreaterThan(AVATAR_ROW_LIMIT_MOBILE);
  });

  it('MAX_FEATURED_PROFILES is a positive integer in a sensible range', () => {
    expect(MAX_FEATURED_PROFILES).toBeGreaterThan(0);
    expect(MAX_FEATURED_PROFILES).toBeLessThanOrEqual(20);
  });
});

// ─── getFeedSessionId ─────────────────────────────────────────────────────────

describe('getFeedSessionId', () => {
  it('returns a non-empty string on first call', () => {
    const id = getFeedSessionId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns the same ID on subsequent calls (localStorage persistence)', () => {
    const id1 = getFeedSessionId();
    const id2 = getFeedSessionId();
    expect(id1).toBe(id2);
  });

  it('sets isPrivateBrowsingMode to false when localStorage is available', () => {
    getFeedSessionId();
    expect(isPrivateBrowsingMode()).toBe(false);
  });
});

// ─── getFeedUserName / setFeedUserName ────────────────────────────────────────

describe('getFeedUserName / setFeedUserName', () => {
  it('getFeedUserName returns null when no name has been set', () => {
    expect(getFeedUserName()).toBeNull();
  });

  it('getFeedUserName returns the name after setFeedUserName is called', () => {
    setFeedUserName('Alice');
    expect(getFeedUserName()).toBe('Alice');
  });

  it('setFeedUserName overwrites the previous name', () => {
    setFeedUserName('Alice');
    setFeedUserName('Bob');
    expect(getFeedUserName()).toBe('Bob');
  });
});

// ─── isPrivateBrowsingMode ────────────────────────────────────────────────────

describe('isPrivateBrowsingMode', () => {
  it('returns false after a successful getFeedSessionId call', () => {
    getFeedSessionId();
    expect(isPrivateBrowsingMode()).toBe(false);
  });

  it('returns true after localStorage throws, then resets to false after recovery', () => {
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    getFeedSessionId(); // Takes in-memory fallback → sets isUsingInMemoryFallback = true
    expect(isPrivateBrowsingMode()).toBe(true);

    getItemSpy.mockRestore();
    localStorage.clear();
    getFeedSessionId(); // localStorage is clear → creates new session → flag = false
    expect(isPrivateBrowsingMode()).toBe(false);
  });
});

// ─── mapSessionFromDb via getClaritySession ───────────────────────────────────

describe('mapSessionFromDb via getClaritySession', () => {
  // P1057: getClaritySession now resolves through the get_session_by_code RPC, because the
  // `code` column is no longer readable by anon/authenticated — neither the projection nor
  // the `.eq('code', …)` filter survives the column grant. The mocks therefore stub
  // supabase.rpc rather than the .from() chain.
  //
  // The fixtures deliberately OMIT `code`: that is what the RPC actually returns now, and it
  // makes these tests assert the splice (the code comes from the caller's argument) instead
  // of a passthrough that would silently keep passing if the splice were dropped.
  it('maps all snake_case DB fields to camelCase ClaritySession', async () => {
    const dbSession = {
      id: 'sess-123',
      creator_name: 'Alice',
      creator_note: 'Bring ideas',
      joiner_name: 'Bob',
      creator_profile_id: 'prof-1',
      joiner_profile_id: 'prof-2',
      state: { currentLevel: 2 },
      demo_status: 'in_progress',
      partnership_status: 'accepted',
      created_at: '2026-01-01T12:00:00Z',
      expires_at: '2026-12-31T12:00:00Z',
      ended_at: null,
      mode: 'live',
      live_state: { active: true },
      is_private: false,
    };

    vi.mocked(supabase.rpc).mockResolvedValue({ data: [dbSession], error: null } as any);

    const result = await getClaritySession('abc123');

    expect(supabase.rpc).toHaveBeenCalledWith('get_session_by_code', { p_code: 'ABC123' });
    expect(result).not.toBeNull();
    expect(result!.id).toBe('sess-123');
    // Spliced from the normalized argument, NOT read back from the row (which has no code).
    expect(result!.code).toBe('ABC123');
    expect(result!.creatorName).toBe('Alice');
    expect(result!.creatorNote).toBe('Bring ideas');
    expect(result!.joinerName).toBe('Bob');
    expect(result!.creatorProfileId).toBe('prof-1');
    expect(result!.joinerProfileId).toBe('prof-2');
    expect(result!.demoStatus).toBe('in_progress');
    expect(result!.partnershipStatus).toBe('accepted');
    expect(result!.createdAt).toBe('2026-01-01T12:00:00Z');
    expect(result!.expiresAt).toBe('2026-12-31T12:00:00Z');
    expect(result!.mode).toBe('live');
    expect(result!.liveState).toEqual({ active: true });
    expect(result!.isPrivate).toBe(false);
  });

  it('defaults isPrivate to false when is_private is absent from DB row', async () => {
    const dbSession = {
      id: 'sess-456',
      creator_name: 'Charlie',
      state: {},
      demo_status: 'waiting',
      partnership_status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
      expires_at: null,
      // is_private intentionally omitted — mapper uses ?? false
    };

    vi.mocked(supabase.rpc).mockResolvedValue({ data: [dbSession], error: null } as any);

    const result = await getClaritySession('XYZ789');
    expect(result).not.toBeNull();
    expect(result!.isPrivate).toBe(false);
  });

  it('returns null when no session data is returned', async () => {
    // An unknown code, an ended session and an expired grace period all return the SAME
    // empty set from the RPC — deliberately indistinguishable, so the read is not an
    // existence oracle.
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any);

    const result = await getClaritySession('NOPE00');
    expect(result).toBeNull();
  });
});

// ─── mapDemoRoundFromDb via getDemoRounds ─────────────────────────────────────

describe('mapDemoRoundFromDb via getDemoRounds', () => {
  it('maps all snake_case fields to camelCase DemoRound', async () => {
    const dbRound = {
      id: 'round-1',
      session_id: 'sess-1',
      level: 2,
      round_number: 3,
      speaker_name: 'Alice',
      listener_name: 'Bob',
      idea_text: 'Cats are independent',
      paraphrase_text: 'You said cats are independent',
      speaker_rating: 80,
      listener_self_rating: 70,
      calibration_gap: 10,
      correction_text: 'More specifically, aloof',
      is_accepted: true,
      created_at: '2026-02-01T10:00:00Z',
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeDoubleOrderChain({ data: [dbRound], error: null }) as any
    );

    const result = await getDemoRounds('sess-1');

    expect(result).toHaveLength(1);
    const round = result[0];
    expect(round.id).toBe('round-1');
    expect(round.sessionId).toBe('sess-1');
    expect(round.level).toBe(2);
    expect(round.roundNumber).toBe(3);
    expect(round.speakerName).toBe('Alice');
    expect(round.listenerName).toBe('Bob');
    expect(round.ideaText).toBe('Cats are independent');
    expect(round.paraphraseText).toBe('You said cats are independent');
    expect(round.speakerRating).toBe(80);
    expect(round.listenerSelfRating).toBe(70);
    expect(round.calibrationGap).toBe(10);
    expect(round.correctionText).toBe('More specifically, aloof');
    expect(round.isAccepted).toBe(true);
    expect(round.createdAt).toBe('2026-02-01T10:00:00Z');
  });

  it('returns empty array on DB error', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeDoubleOrderChain({ data: null, error: { message: 'DB error' } }) as any
    );

    const result = await getDemoRounds('sess-bad');
    expect(result).toEqual([]);
  });
});

// ─── mapClarityIdeaFromDb via getClarityIdeas ─────────────────────────────────

describe('mapClarityIdeaFromDb via getClarityIdeas', () => {
  it('maps all snake_case fields to camelCase ClarityIdea', async () => {
    const dbIdea = {
      id: 'idea-1',
      session_id: 'sess-1',
      author_name: 'Alice',
      content: 'My idea about clarity',
      source_level: 3,
      status: 'pending',
      rounds_count: 2,
      final_accuracy: 85,
      discussed_at: '2026-02-01T11:00:00Z',
      created_at: '2026-02-01T10:00:00Z',
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeSingleOrderChain({ data: [dbIdea], error: null }) as any
    );

    const result = await getClarityIdeas('sess-1');

    expect(result).toHaveLength(1);
    const idea = result[0];
    expect(idea.id).toBe('idea-1');
    expect(idea.sessionId).toBe('sess-1');
    expect(idea.authorName).toBe('Alice');
    expect(idea.content).toBe('My idea about clarity');
    expect(idea.sourceLevel).toBe(3);
    expect(idea.status).toBe('pending');
    expect(idea.roundsCount).toBe(2);
    expect(idea.finalAccuracy).toBe(85);
    expect(idea.discussedAt).toBe('2026-02-01T11:00:00Z');
    expect(idea.createdAt).toBe('2026-02-01T10:00:00Z');
  });

  it('returns empty array when no ideas exist', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeSingleOrderChain({ data: [], error: null }) as any
    );

    const result = await getClarityIdeas('sess-empty');
    expect(result).toEqual([]);
  });
});

// ─── mapChatMessageFromDb via getChatMessages ─────────────────────────────────

describe('mapChatMessageFromDb via getChatMessages', () => {
  it('maps snake_case fields to camelCase ChatMessage', async () => {
    const dbMessage = {
      id: 'msg-1',
      session_id: 'sess-1',
      author_name: 'Alice',
      content: 'Hello there',
      created_at: '2026-02-01T10:00:00Z',
      explanation_requested_at: '2026-02-01T10:01:00Z',
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeSingleOrderChain({ data: [dbMessage], error: null }) as any
    );

    const result = await getChatMessages('sess-1');

    expect(result).toHaveLength(1);
    const msg = result[0];
    expect(msg.id).toBe('msg-1');
    expect(msg.sessionId).toBe('sess-1');
    expect(msg.authorName).toBe('Alice');
    expect(msg.content).toBe('Hello there');
    expect(msg.createdAt).toBe('2026-02-01T10:00:00Z');
    expect(msg.explanationRequestedAt).toBe('2026-02-01T10:01:00Z');
  });

  it('maps null explanation_requested_at to null', async () => {
    const dbMessage = {
      id: 'msg-2',
      session_id: 'sess-1',
      author_name: 'Bob',
      content: 'No request pending',
      created_at: '2026-02-01T10:00:00Z',
      explanation_requested_at: null,
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeSingleOrderChain({ data: [dbMessage], error: null }) as any
    );

    const result = await getChatMessages('sess-1');
    expect(result[0].explanationRequestedAt).toBeNull();
  });
});

// ─── mapVerificationFromDb via getVerificationsForMessage ─────────────────────

describe('mapVerificationFromDb via getVerificationsForMessage', () => {
  it('maps all snake_case fields to camelCase Verification', async () => {
    const dbVerification = {
      id: 'verif-1',
      message_id: 'msg-1',
      verifier_name: 'Bob',
      paraphrase_text: 'You said X',
      self_rating: 75,
      accuracy_rating: 80,
      calibration_gap: 5,
      correction_text: 'Close but missed Y',
      round_number: 2,
      status: 'accepted',
      position: 'agree',
      audio_url: 'https://example.com/audio.webm',
      created_at: '2026-02-01T10:00:00Z',
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeSingleOrderChain({ data: [dbVerification], error: null }) as any
    );

    const result = await getVerificationsForMessage('msg-1');

    expect(result).toHaveLength(1);
    const v = result[0];
    expect(v.id).toBe('verif-1');
    expect(v.messageId).toBe('msg-1');
    expect(v.verifierName).toBe('Bob');
    expect(v.paraphraseText).toBe('You said X');
    expect(v.selfRating).toBe(75);
    expect(v.accuracyRating).toBe(80);
    expect(v.calibrationGap).toBe(5);
    expect(v.correctionText).toBe('Close but missed Y');
    expect(v.roundNumber).toBe(2);
    expect(v.status).toBe('accepted');
    expect(v.position).toBe('agree');
    expect(v.audioUrl).toBe('https://example.com/audio.webm');
    expect(v.createdAt).toBe('2026-02-01T10:00:00Z');
  });

  it('defaults roundNumber to 1 when DB field is null', async () => {
    const dbVerification = {
      id: 'verif-2',
      message_id: 'msg-1',
      verifier_name: 'Charlie',
      paraphrase_text: 'A paraphrase',
      round_number: null,
      status: 'pending',
      created_at: '2026-02-01T10:00:00Z',
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeSingleOrderChain({ data: [dbVerification], error: null }) as any
    );

    const result = await getVerificationsForMessage('msg-1');
    expect(result[0].roundNumber).toBe(1);
  });

  it('coalesces absent optional fields to undefined', async () => {
    const dbVerification = {
      id: 'verif-3',
      message_id: 'msg-1',
      verifier_name: 'Dave',
      paraphrase_text: 'Just a paraphrase',
      round_number: 1,
      status: 'pending',
      created_at: '2026-02-01T10:00:00Z',
      // self_rating, accuracy_rating, calibration_gap, correction_text, position, audio_url all absent
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeSingleOrderChain({ data: [dbVerification], error: null }) as any
    );

    const result = await getVerificationsForMessage('msg-1');
    const v = result[0];
    expect(v.selfRating).toBeUndefined();
    expect(v.accuracyRating).toBeUndefined();
    expect(v.calibrationGap).toBeUndefined();
    expect(v.correctionText).toBeUndefined();
    expect(v.position).toBeUndefined();
    expect(v.audioUrl).toBeUndefined();
  });
});

// ─── mapEventFromDb / mapEventWithHostFromDb via getEventBySlug ───────────────

describe('mapEventFromDb / mapEventWithHostFromDb via getEventBySlug', () => {
  it('maps event snake_case fields to camelCase', async () => {
    const dbEvent = {
      id: 'evt-1',
      slug: 'test-event-2026-01-01',
      title: 'Test Event',
      description: 'A test event description',
      datetime: '2026-03-15T18:00:00Z',
      duration_minutes: 90,
      timezone: 'America/Los_Angeles',
      location: 'San Francisco, CA',
      host_id: 'host-1',
      max_attendees: 30,
      created_at: '2026-01-01T00:00:00Z',
      status: 'upcoming',
      profiles: {
        name: 'Alice Host',
        slug: 'alice-host',
        role: 'Community Lead',
        avatar_color: '#3B82F6',
        avatar_url: null,
        has_pledged: true,
        ears_count: 5,
      },
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeSingleChain({ data: dbEvent, error: null }) as any
    );

    const result = await getEventBySlug('test-event-2026-01-01');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('evt-1');
    expect(result!.slug).toBe('test-event-2026-01-01');
    expect(result!.title).toBe('Test Event');
    expect(result!.durationMinutes).toBe(90);
    expect(result!.timezone).toBe('America/Los_Angeles');
    expect(result!.location).toBe('San Francisco, CA');
    expect(result!.hostId).toBe('host-1');
    expect(result!.maxAttendees).toBe(30);
    expect(result!.status).toBe('upcoming');
  });

  it('maps joined host profile fields to EventWithHost', async () => {
    const dbEvent = {
      id: 'evt-2',
      slug: 'another-event',
      title: 'Another Event',
      description: 'Desc',
      datetime: '2026-04-01T18:00:00Z',
      duration_minutes: 60,
      timezone: 'UTC',
      location: 'Online',
      host_id: 'host-2',
      created_at: '2026-01-01T00:00:00Z',
      status: 'upcoming',
      profiles: {
        name: 'Bob Host',
        slug: 'bob-host',
        role: 'Coach',
        avatar_color: '#10B981',
        avatar_url: 'https://example.com/bob.jpg',
        has_pledged: true,
        ears_count: 3,
      },
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeSingleChain({ data: dbEvent, error: null }) as any
    );

    const result = await getEventBySlug('another-event');

    expect(result!.hostName).toBe('Bob Host');
    expect(result!.hostSlug).toBe('bob-host');
    expect(result!.hostRole).toBe('Coach');
    expect(result!.hostAvatarColor).toBe('#10B981');
    expect(result!.hostAvatarUrl).toBe('https://example.com/bob.jpg');
    expect(result!.hostHasPledged).toBe(true);
    expect(result!.hostEarCount).toBe(3);
  });

  it('returns null when event is not found (PGRST116 error code)', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeSingleChain({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      }) as any
    );

    const result = await getEventBySlug('nonexistent-event');
    expect(result).toBeNull();
  });

  it('maps null max_attendees to undefined in the Event type', async () => {
    const dbEvent = {
      id: 'evt-3',
      slug: 'unlimited-event',
      title: 'Unlimited Capacity',
      description: 'Desc',
      datetime: '2026-05-01T18:00:00Z',
      duration_minutes: 120,
      timezone: 'UTC',
      location: 'Online',
      host_id: 'host-1',
      max_attendees: null,
      created_at: '2026-01-01T00:00:00Z',
      status: 'upcoming',
      profiles: {},
    };

    vi.mocked(supabase.from).mockReturnValue(
      makeSingleChain({ data: dbEvent, error: null }) as any
    );

    const result = await getEventBySlug('unlimited-event');
    expect(result!.maxAttendees).toBeUndefined();
  });
});


describe('extractErrorDetail', () => {
  it('extracts edge-function `error` field from JSON body', () => {
    expect(extractErrorDetail('{"error":"missing sessionCode"}')).toBe('missing sessionCode');
  });

  it('falls back to `message` for Supabase gateway shape (JWT expired)', () => {
    // Bug being fixed: gateway returns `{message: ...}`, not `{error: ...}`.
    // Old code did `error.error` and produced "undefined" — must NOT happen.
    const detail = extractErrorDetail('{"message":"JWT expired"}');
    expect(detail).toBe('JWT expired');
    expect(detail).not.toContain('undefined');
  });

  it('returns truncated raw text when body is not JSON', () => {
    const detail = extractErrorDetail('Internal Server Error');
    expect(detail).toBe('Internal Server Error');
  });

  it('returns empty string for empty body', () => {
    expect(extractErrorDetail('')).toBe('');
  });

  it('truncates long non-JSON bodies to 200 chars', () => {
    const long = 'x'.repeat(500);
    expect(extractErrorDetail(long).length).toBe(200);
  });

  it('ignores non-string error/message fields', () => {
    expect(extractErrorDetail('{"error":null,"message":42}')).toBe('{"error":null,"message":42}'.slice(0, 200));
  });
});
