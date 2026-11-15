// @vitest-environment jsdom
/**
 * P1685 — a hidden in-room learning pauses the Listening Game video.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ListeningGameScreen } from '@/app/prototypes/events/prep/ListeningGameScreen';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('P1685 pause when hidden', () => {
  it('pauses a playing video when active turns false', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const view = render(<ListeningGameScreen onContinue={() => {}} active />);
    fireEvent.click(screen.getByRole('button', { name: 'Play the Listening Game video' }));
    expect(document.querySelector('video')).not.toBeNull();
    expect(pause).not.toHaveBeenCalled();
    view.rerender(<ListeningGameScreen onContinue={() => {}} active={false} />);
    expect(pause).toHaveBeenCalled();
  });
  it('Continue without video advances; after playing the button reads Continue', () => {
    const onContinue = vi.fn();
    render(<ListeningGameScreen onContinue={onContinue} />);
    fireEvent.click(screen.getByText('Continue without video'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    cleanup();
    const again = vi.fn();
    render(<ListeningGameScreen onContinue={again} />);
    fireEvent.click(screen.getByText('Play the video'));
    expect(screen.queryByText('Continue without video')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(again).toHaveBeenCalledTimes(1);
  });
});
