import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock: Supabase client ────────────────────────────────────────────────────

const mockEq = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function setupMockChain(error: { message: string; code: string } | null = null) {
  mockEq.mockResolvedValue({ error });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate });
}

// TDD canary: this import will fail until saveLetterPauseState is added to letters-service.ts
// in the /dev phase. The test file failing-to-load is the correct signal — do not add a stub.
import { saveLetterPauseState } from '@/app/data/letters-service';
import { supabase as _supabase } from '@/lib/supabase';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('P745: saveLetterPauseState()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMockChain(null); // default: success
  });

  it('writes saved_story_index for a valid storyIndex (mid-range)', async () => {
    await saveLetterPauseState('delivery-uuid-1', 3);

    expect(mockFrom).toHaveBeenCalledWith('letter_deliveries');
    expect(mockUpdate).toHaveBeenCalledWith({ saved_story_index: 3 });
    expect(mockEq).toHaveBeenCalledWith('id', 'delivery-uuid-1');
  });

  it('storyIndex=0 (first story, 0-indexed) is valid and written to DB', async () => {
    await saveLetterPauseState('delivery-uuid-2', 0);

    expect(mockUpdate).toHaveBeenCalledWith({ saved_story_index: 0 });
  });

  it('storyIndex=999 (upper bound from CHECK constraint) is valid and written to DB', async () => {
    await saveLetterPauseState('delivery-uuid-3', 999);

    expect(mockUpdate).toHaveBeenCalledWith({ saved_story_index: 999 });
  });

  it('storyIndex < 0 → throws RangeError before any DB call', async () => {
    await expect(saveLetterPauseState('delivery-uuid-4', -1)).rejects.toThrow(
      /out of bounds/i
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('storyIndex > 999 → throws RangeError before any DB call', async () => {
    await expect(saveLetterPauseState('delivery-uuid-5', 1000)).rejects.toThrow(
      /out of bounds/i
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('storyIndex = 1000 (exact over-boundary) → rejected', async () => {
    await expect(saveLetterPauseState('delivery-uuid-6', 1000)).rejects.toBeInstanceOf(RangeError);
  });

  it('propagates Supabase UPDATE error as thrown Error', async () => {
    setupMockChain({ message: 'network timeout', code: '500' });

    await expect(saveLetterPauseState('delivery-uuid-7', 2)).rejects.toThrow(
      /saveLetterPauseState failed/i
    );
  });

  it('update payload contains only saved_story_index (no other columns mutated)', async () => {
    await saveLetterPauseState('delivery-uuid-8', 5);

    const updateArg = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(updateArg)).toEqual(['saved_story_index']);
    expect(updateArg['saved_story_index']).toBe(5);
  });
});
