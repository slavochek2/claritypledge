/**
 * Canary test for P816: End Session button in LiveSessionBanner must disable
 * and show "Ending…" immediately on click — before the async onExit resolves.
 *
 * FAILS before fix: button stays "End Session" and enabled while onExit is in flight.
 * PASSES after fix: button disables and shows "Ending…" within the same event loop tick.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LiveSessionBanner } from '@/app/components/partners/live-session-banner';

vi.mock('@/auth', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-sound', () => ({
  useSoundEnabled: () => [true, vi.fn()],
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => ({
    signOut: vi.fn(),
    user: null,
    showUserMenu: false,
    hasPledged: false,
  }),
}));

describe('P816: LiveSessionBanner End Session feedback', () => {
  it('disables button and shows "Ending…" immediately after click while onExit is in flight', () => {
    // Slow async onExit — never resolves during this test
    const onExit = vi.fn(() => new Promise<void>(() => {}));

    render(
      <BrowserRouter>
        <LiveSessionBanner onExit={onExit} isLiveMeeting={true} />
      </BrowserRouter>
    );

    const button = screen.getByTestId('leave-meeting');

    // Pre-click: button is enabled and shows "End Session"
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('End Session');

    fireEvent.click(button);

    // Post-click (onExit still in flight): button must show pending feedback
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Ending…');
  });

  it('does not fire onExit a second time if clicked again while Ending', () => {
    const onExit = vi.fn(() => new Promise<void>(() => {}));

    render(
      <BrowserRouter>
        <LiveSessionBanner onExit={onExit} isLiveMeeting={true} />
      </BrowserRouter>
    );

    const button = screen.getByTestId('leave-meeting');

    fireEvent.click(button);
    fireEvent.click(button); // second click while in-flight

    // onExit must have been called exactly once
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
