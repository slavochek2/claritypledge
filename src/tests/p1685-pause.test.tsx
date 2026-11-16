// @vitest-environment jsdom
/**
 * P1685 — the Listening Game screen: rules above the video, the video is required (D3), a hidden in-room learning pauses it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ListeningGameScreen } from '@/app/prototypes/events/prep/ListeningGameScreen';
import { LISTENING_GAME_COPY } from '@/app/prototypes/events/prep/listening-game';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('P1685 screen', () => {
  it('shows the written rules above the video, reading on their own', () => {
    render(<ListeningGameScreen onContinue={() => {}} />);
    expect(screen.getByText(LISTENING_GAME_COPY.heading)).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([...LISTENING_GAME_COPY.rules]);
    const rules = screen.getByTestId('listening-game-rules');
    const clip = screen.getByTestId('clip-listening-game');
    expect(rules.compareDocumentPosition(clip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is required: only "Play the video" until played, no skip link; then Continue', () => {
    const onContinue = vi.fn();
    render(<ListeningGameScreen onContinue={onContinue} />);
    expect(screen.getByRole('button', { name: 'Play the video' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByText(/without video/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play the video' }));
    expect(screen.queryByRole('button', { name: 'Play the video' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith(true);
  });

  it('pauses a playing video when active turns false', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const view = render(<ListeningGameScreen onContinue={() => {}} active />);
    fireEvent.click(screen.getByRole('button', { name: 'Play the Listening Game video' }));
    expect(document.querySelector('video')).not.toBeNull();
    expect(pause).not.toHaveBeenCalled();
    view.rerender(<ListeningGameScreen onContinue={() => {}} active={false} />);
    expect(pause).toHaveBeenCalled();
  });
});
