/**
 * @file p697-sender-avatar-in-letter-reading.test.ts
 * @description P697: Canary + regression tests for sender avatar data in letter reading.
 *
 * Bug: getLetterForReading (authenticated path) only fetched sender `name` from profiles,
 * omitting `avatar_url`, `avatar_color`, and `has_pledged`.
 *
 * These tests verify that the returned letter object carries all three sender avatar
 * fields so LetterReadingFlowPrivate can build a complete senderProfileOwner.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// mockFrom and mockRpc must be hoisted so they're available inside the vi.mock factory
const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'sender-123' } } },
        error: null,
      }),
    },
    from: mockFrom,
    rpc: mockRpc,
  },
}));

vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  getLetterForReading,
  getLetterForReadingByToken,
  getLetterForPublicReading,
} from '@/app/data/letters-service';

const LETTER_ID = 'letter-abc';
const DELIVERY_ID = 'delivery-xyz';
const SENDER_ID = 'sender-123';

const baseLetter = {
  id: LETTER_ID,
  source_doc_id: 'doc-1',
  sender_id: SENDER_ID,
  mode: 'one-to-one',
  status: 'sealed',
  sealed_at: '2026-04-12T10:00:00Z',
  created_at: '2026-04-12T09:00:00Z',
};

const baseDelivery = {
  id: DELIVERY_ID,
  letter_id: LETTER_ID,
  receiver_email: null,
  receiver_profile_id: 'receiver-999',
  receiver_name: 'Bob',
  invitation_token: 'tok',
  invitation_expires_at: null,
  access_token_expires_at: null,
  status: 'opened',
  stories_rated: 0,
  opened_at: '2026-04-12T10:05:00Z',
  completed_at: null,
  read_at: null,
  created_at: '2026-04-12T09:00:00Z',
};

/** Build a Supabase-like chain mock returning `data` from `.single()` */
function singleChain(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

/** Set up mockFrom for the 4 sequential supabase calls in getLetterForReading */
function setupMocks(profileData: {
  name: string;
  avatar_url: string | null;
  avatar_color: string | null;
  has_pledged: boolean;
}) {
  mockFrom
    .mockImplementationOnce(() => singleChain(baseDelivery))     // letter_deliveries
    .mockImplementationOnce(() => singleChain(baseLetter))        // clarity_letters
    .mockImplementationOnce(() => singleChain(profileData))       // profiles
    .mockImplementationOnce(() => ({                              // letter_story_snapshots
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
}

describe('P697: sender avatar fields in getLetterForReading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CANARY — letter.sender_avatar_url populated when profile has a Google photo', async () => {
    setupMocks({
      name: 'Alice',
      avatar_url: 'https://lh3.googleusercontent.com/alice.jpg',
      avatar_color: '#3B82F6',
      has_pledged: true,
    });

    const result = await getLetterForReading(LETTER_ID, DELIVERY_ID);

    // Before fix: all three are undefined. After fix: all three are set.
    expect(result).not.toBeNull();
    expect(result!.letter.sender_avatar_url).toBe(
      'https://lh3.googleusercontent.com/alice.jpg'
    );
    expect(result!.letter.sender_avatar_color).toBe('#3B82F6');
    expect(result!.letter.sender_has_pledged).toBe(true);
  });

  it('sender_has_pledged is false when profile has no pledge', async () => {
    setupMocks({
      name: 'Bob',
      avatar_url: null,
      avatar_color: null,
      has_pledged: false,
    });

    const result = await getLetterForReading(LETTER_ID, DELIVERY_ID);

    expect(result).not.toBeNull();
    // avatar_url null → coerced to undefined
    expect(result!.letter.sender_avatar_url).toBeUndefined();
    expect(result!.letter.sender_has_pledged).toBe(false);
  });
});

describe('P697: sender avatar fields via RPC paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getLetterForReadingByToken — avatar fields flow through from RPC response', async () => {
    // RPC returns the full letter object with avatar fields populated
    const rpcLetter = {
      ...baseLetter,
      sender_display_name: 'Alice',
      sender_avatar_url: 'https://lh3.googleusercontent.com/alice.jpg',
      sender_avatar_color: '#3B82F6',
      sender_has_pledged: true,
    };
    mockRpc.mockResolvedValue({
      data: {
        letter: rpcLetter,
        snapshots: [],
        delivery: null,
      },
      error: null,
    });

    const result = await getLetterForReadingByToken('some-uuid-token');

    expect(result).not.toBeNull();
    expect(result!.letter.sender_avatar_url).toBe(
      'https://lh3.googleusercontent.com/alice.jpg'
    );
    expect(result!.letter.sender_has_pledged).toBe(true);
  });

  it('getLetterForPublicReading — avatar fields flow through from RPC response', async () => {
    const rpcLetter = {
      id: LETTER_ID,
      sender_id: SENDER_ID,
      sender_display_name: 'Alice',
      sender_avatar_url: 'https://lh3.googleusercontent.com/alice.jpg',
      sender_avatar_color: '#3B82F6',
      sender_has_pledged: true,
      mode: 'one-to-many',
      status: 'sealed',
      sealed_at: '2026-04-12T10:00:00Z',
      created_at: '2026-04-12T09:00:00Z',
    };
    mockRpc.mockResolvedValue({
      data: {
        letter: rpcLetter,
        snapshots: [],
        predictions: [],
      },
      error: null,
    });

    const result = await getLetterForPublicReading(LETTER_ID);

    expect(result).not.toBeNull();
    const letter = result!.letter as Record<string, unknown>;
    expect(letter.sender_avatar_url).toBe(
      'https://lh3.googleusercontent.com/alice.jpg'
    );
    expect(letter.sender_has_pledged).toBe(true);
  });
});
