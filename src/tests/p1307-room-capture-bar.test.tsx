/**
 * @file p1307-room-capture-bar.test.tsx
 * @description P1307 UI Contract — the persistent capture bar: "● Transcribing for AI
 * insights", actions Open + End session, rendered only in capturing/stalled state, End
 * calling the per-person end (never a room end).
 *
 * ASSUMPTION, stated because the module does not exist yet: `RoomCaptureBar`
 * (`src/app/components/session/room-capture-bar.tsx`, per spec §Files to Create) sources
 * its text/actions from `useRoomCapture()` (Architecture Decision 7) and renders a
 * presentational `SessionBar` underneath. This file mocks `useRoomCapture` directly and
 * renders `RoomCaptureBar` standalone — no Router/Auth/Supabase needed, unlike the
 * EventRoomReady/EventRoomGate source-grep tests, because this component is described as
 * presentational (props/hook-driven, not fetching its own data).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockUseRoomCapture = vi.fn();
// No @ts-expect-error needed here: vi.mock's first argument is a plain string literal, not
// a real `import`, so TS never resolves the module against this line — only the `import`
// below (which actually pulls in the not-yet-existing named export) needs the directive.
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => mockUseRoomCapture(),
}));

import { RoomCaptureBar } from '@/app/components/session/room-capture-bar';

beforeEach(() => {
  mockUseRoomCapture.mockReset();
});

function baseCaptureState(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'capturing',
    roomId: 'r1',
    open: vi.fn(),
    endMyCapture: vi.fn(),
    ...overrides,
  };
}

describe('P1307: RoomCaptureBar — visibility', () => {
  it('renders in capturing state', () => {
    mockUseRoomCapture.mockReturnValue(baseCaptureState({ phase: 'capturing' }));
    render(<RoomCaptureBar />);
    expect(screen.getByText(/Transcribing for AI insights/i)).toBeInTheDocument();
  });

  it('renders in stalled state too', () => {
    mockUseRoomCapture.mockReturnValue(baseCaptureState({ phase: 'stalled' }));
    const { container } = render(<RoomCaptureBar />);
    expect(container.textContent, 'the bar must still be visible while stalled, per D9 — never running with no indicator').not.toBe('');
  });

  it('does NOT render in idle, starting, paused, or ending', () => {
    for (const phase of ['idle', 'starting', 'paused', 'ending']) {
      mockUseRoomCapture.mockReturnValue(baseCaptureState({ phase }));
      const { container, unmount } = render(<RoomCaptureBar />);
      expect(container.textContent, `phase=${phase} must render nothing`).toBe('');
      unmount();
    }
  });

  it('while paused specifically, absence satisfies "capture never runs with no indicator" — nothing is running', () => {
    // D3/D13's "no paused message" requirement, restated as a negative: the bar's silence
    // during paused is not a violation of D9, because nothing is being captured.
    mockUseRoomCapture.mockReturnValue(baseCaptureState({ phase: 'paused' }));
    const { container } = render(<RoomCaptureBar />);
    expect(container.textContent).toBe('');
  });
});

describe('P1307: RoomCaptureBar — content and actions', () => {
  it('shows the "●" indicator and the exact UI Contract copy', () => {
    mockUseRoomCapture.mockReturnValue(baseCaptureState());
    render(<RoomCaptureBar />);
    expect(screen.getByText(/●\s*Transcribing for AI insights/)).toBeInTheDocument();
  });

  it('has an "Open" action and an "End session" action', () => {
    mockUseRoomCapture.mockReturnValue(baseCaptureState());
    render(<RoomCaptureBar />);
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end session/i })).toBeInTheDocument();
  });

  it('End session calls the PER-PERSON end, never a room-wide end function', () => {
    const endMyCapture = vi.fn();
    mockUseRoomCapture.mockReturnValue(baseCaptureState({ endMyCapture }));
    render(<RoomCaptureBar />);
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    expect(endMyCapture).toHaveBeenCalledTimes(1);
    expect(endMyCapture).toHaveBeenCalledWith('r1');
  });

  it('Open triggers the provider\'s own open action, not a page navigation string the test can misread as a room-end', () => {
    const open = vi.fn();
    mockUseRoomCapture.mockReturnValue(baseCaptureState({ open }));
    render(<RoomCaptureBar />);
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('P1307: RoomCaptureBar — stall-state copy is a FOUNDER DECISION placeholder', () => {
  it('does not assert specific stall-state text — only that SOMETHING renders and the bar does not silently disappear', () => {
    // UI Contract: "Bar, stall state (3 failed slices) | [FOUNDER DECISION: copy]".
    // FOUNDER DECISION: copy pending — this test intentionally does not pin the string.
    mockUseRoomCapture.mockReturnValue(baseCaptureState({ phase: 'stalled' }));
    render(<RoomCaptureBar />);
    expect(screen.queryByRole('button', { name: /end session/i })).toBeInTheDocument();
  });
});
