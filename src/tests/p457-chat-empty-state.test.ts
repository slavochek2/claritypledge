/**
 * @file p457-chat-empty-state.test.ts
 * @description Unit tests for P457: Chat Empty State Redesign
 *
 * Tests the logic extracted from StoryGuideChat.tsx:
 * - getPlaceholder() returns correct text per phase
 * - Opening message fires unconditionally when messages.length === 0
 * - Send button is never visually disabled (always blue)
 * - Input wrapper uses centering classes in idle phase, sticky in active phases
 *
 * NOTE: Tests target logic that lives in / is derived from StoryGuideChat.tsx.
 * When the component is updated, update the imports below.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mirror getPlaceholder() logic from StoryGuideChat.tsx
// Replace with direct import once implemented:
// import { getPlaceholder } from '@/app/components/story-guide/StoryGuideChat';
// ---------------------------------------------------------------------------

type ChatPhase =
  | 'idle'
  | 'brain-dump'
  | 'streaming'
  | 'rating'
  | 'iterating'
  | 'polish'
  | 'visibility'
  | 'saving'
  | 'saved';

function getPlaceholder(phase: ChatPhase): string {
  if (phase === 'idle' || phase === 'brain-dump') return 'Tell me so I understand you';
  if (phase === 'rating' || phase === 'iterating') return '0–10, or describe what\'s off...';
  if (phase === 'streaming') return 'Thinking...';
  return '';
}

// ---------------------------------------------------------------------------
// Mirror input wrapper class logic from StoryGuideChat.tsx
// ---------------------------------------------------------------------------

function getInputWrapperClass(phase: ChatPhase): string {
  if (phase === 'idle') {
    return 'flex items-center justify-center flex-1';
  }
  return 'sticky bottom-0 bg-background border-t border-border px-4 py-3 pb-safe';
}

// ---------------------------------------------------------------------------
// Mirror send button class logic from StoryGuideChat.tsx
// ---------------------------------------------------------------------------

function getSendButtonClass(_sendDisabled: boolean): string {
  // P457: always blue regardless of disabled state
  return 'bg-blue-600 text-white hover:bg-blue-700';
}

// ---------------------------------------------------------------------------
// Mirror opening message condition from StoryGuideChat.tsx
// ---------------------------------------------------------------------------

function shouldShowOpeningMessage(messages: unknown[], _pointId?: string): boolean {
  // P457: unconditional — fires whenever messages is empty, regardless of pointId
  return messages.length === 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('P457 — getPlaceholder()', () => {
  it('returns "Tell me so I understand you" for idle phase', () => {
    expect(getPlaceholder('idle')).toBe('Tell me so I understand you');
  });

  it('returns "Tell me so I understand you" for brain-dump phase', () => {
    expect(getPlaceholder('brain-dump')).toBe('Tell me so I understand you');
  });

  it('returns rating prompt for rating phase', () => {
    expect(getPlaceholder('rating')).toContain('0–10');
  });

  it('returns rating prompt for iterating phase', () => {
    expect(getPlaceholder('iterating')).toContain('0–10');
  });

  it('returns "Thinking..." for streaming phase', () => {
    expect(getPlaceholder('streaming')).toBe('Thinking...');
  });

  it('returns empty string for terminal phases (visibility, saving, saved, polish)', () => {
    const terminalPhases: ChatPhase[] = ['visibility', 'saving', 'saved', 'polish'];
    for (const phase of terminalPhases) {
      expect(getPlaceholder(phase)).toBe('');
    }
  });
});

describe('P457 — send button always blue', () => {
  it('returns blue class when input is empty (sendDisabled = true)', () => {
    const cls = getSendButtonClass(true);
    expect(cls).toContain('bg-blue-600');
    expect(cls).not.toContain('bg-muted');
    expect(cls).not.toContain('cursor-not-allowed');
  });

  it('returns blue class when input has content (sendDisabled = false)', () => {
    const cls = getSendButtonClass(false);
    expect(cls).toContain('bg-blue-600');
  });
});

describe('P457 — input wrapper positioning', () => {
  it('uses centering classes when phase is idle', () => {
    const cls = getInputWrapperClass('idle');
    expect(cls).toContain('flex');
    expect(cls).toContain('items-center');
    expect(cls).toContain('justify-center');
    expect(cls).not.toContain('sticky');
  });

  it('uses sticky bottom when phase is brain-dump (active chat)', () => {
    const cls = getInputWrapperClass('brain-dump');
    expect(cls).toContain('sticky');
    expect(cls).toContain('bottom-0');
  });

  it('uses sticky bottom when phase is streaming', () => {
    const cls = getInputWrapperClass('streaming');
    expect(cls).toContain('sticky');
  });

  it('uses sticky bottom when phase is rating', () => {
    const cls = getInputWrapperClass('rating');
    expect(cls).toContain('sticky');
  });
});

describe('P457 — opening AI message fires unconditionally', () => {
  it('shows opening message when messages is empty and no pointId', () => {
    expect(shouldShowOpeningMessage([], undefined)).toBe(true);
  });

  it('shows opening message when messages is empty and pointId is present', () => {
    expect(shouldShowOpeningMessage([], 'some-point-id')).toBe(true);
  });

  it('does NOT show opening message when messages already exist', () => {
    expect(shouldShowOpeningMessage([{ id: '1', role: 'ai' }])).toBe(false);
  });

  it('does NOT show opening message when multiple messages exist', () => {
    expect(shouldShowOpeningMessage([
      { id: '1', role: 'ai' },
      { id: '2', role: 'user' },
    ])).toBe(false);
  });
});
