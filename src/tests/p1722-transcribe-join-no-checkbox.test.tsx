/**
 * P1722 UAT round 4: the standalone room page (/transcribe, /transcribe/:code) has no consent checkbox. Join is enabled at once;
 * tapping Join is the consent. The title, the intro and the Privacy Policy link stay.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

const lookup = vi.hoisted(() => ({ state: 'room' as string, mastermind: false as boolean | null }));
vi.mock('@/app/pages/use-room-event', () => ({ useRoomEventState: () => lookup.state }));
vi.mock('@/app/pages/use-room-is-mastermind', () => ({ useRoomIsMastermind: () => lookup.mastermind }));

import { TranscribeJoinForm } from '@/app/pages/transcribe-join-form';

beforeEach(() => { lookup.state = 'room'; lookup.mastermind = false; });
afterEach(cleanup);
const form = (over: Partial<Parameters<typeof TranscribeJoinForm>[0]> = {}) => {
  const onJoin = vi.fn();
  render(<TranscribeJoinForm urlCode="ABC234" joinError={null} joining={false} onJoin={onJoin} {...over} />);
  return onJoin;
};

describe('Join waits for the room disclosure', () => {
  it('stays disabled while the room lookup is pending ("Checking this room…"), enabled once it settles', () => {
    lookup.state = 'loading';
    form();
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain('Checking this room…');
    expect(screen.getByTestId('transcribe-join-button')).toBeDisabled();
    cleanup();
    lookup.state = 'event';
    form();
    expect(screen.getByTestId('transcribe-join-button')).toBeEnabled();
  });

  it('stays disabled while an event room\'s mastermind lookup is still unknown', () => {
    lookup.state = 'event';
    lookup.mastermind = null;
    form();
    expect(screen.getByTestId('transcribe-join-button')).toBeDisabled();
  });

  it('Join is described by the disclosure text', () => {
    form();
    const id = screen.getByTestId('transcribe-join-button').getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toContain('Your spoken words will be transcribed live');
  });
});

describe('the standalone room page join form', () => {
  it('Join is enabled at once and one tap joins', () => {
    const onJoin = form();
    const join = screen.getByTestId('transcribe-join-button');
    expect(join).toBeEnabled();
    fireEvent.click(join);
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('there is no consent toggle or checkbox, and no "tap to agree" text', () => {
    form();
    expect(screen.queryByTestId('transcribe-recording-toggle')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/tap to agree/i)).toBeNull();
  });

  it('keeps the title and the Privacy Policy link', () => {
    form();
    expect(screen.getByRole('heading', { name: 'Join the transcription room' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy-policy');
  });

  it('is disabled only while joining', () => {
    form({ joining: true });
    expect(screen.getByTestId('transcribe-join-button')).toBeDisabled();
  });
});
