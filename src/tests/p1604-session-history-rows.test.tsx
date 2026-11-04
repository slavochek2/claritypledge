/**
 * P1604 (founder live test): in session history a transcription session says what it is (never "0 rounds"), shows where its text
 * is, and the whole row is plainly a button. A real rounds session is unchanged. Layout is checked by what the markup can promise
 * (truncation, no fixed widths, 44px+ target); the visual pass at 375/320 is a browser check.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionList } from '@/app/components/sessions/session-list';
import type { SessionSummary } from '@/app/data/sessions-service';
import { TRANSCRIPT_TITLE, TRANSCRIPT_PROCESSING, TRANSCRIPT_FAILED } from '@/app/components/session/capture-copy';

const base: SessionSummary = {
  id: 's1', partnerName: 'Ada', roundCount: 0, date: '2026-11-04T10:05:00Z', sessionHistory: [], isPrivate: false,
  transcriptStatus: 'completed', roomId: null, transcriptionState: 'none', chatName: null,
};
const room = (over: Partial<SessionSummary> = {}): SessionSummary => ({ ...base, roomId: 'room-1', ...over });

function renderList(sessions: SessionSummary[], onSessionClick = vi.fn()) {
  render(<MemoryRouter><SessionList sessions={sessions} isLoading={false} isError={false} onRetry={vi.fn()} onSessionClick={onSessionClick} /></MemoryRouter>);
  return onSessionClick;
}

describe('a transcription session row', () => {
  it('says what it is, with the chat\'s name, and never "0 rounds"', () => {
    renderList([room({ chatName: 'Ben' })]);
    const row = screen.getByTestId('transcript-row');
    expect(within(row).getByText(TRANSCRIPT_TITLE)).toBeTruthy();
    expect(row.textContent).toContain('Ben');
    expect(row.textContent).not.toMatch(/round/i);
  });

  it('a plain /transcribe room (no chat) is just "Transcript"', () => {
    renderList([room()]);
    const row = screen.getByTestId('transcript-row');
    expect(row.textContent).not.toMatch(/round|no rounds/i);
    expect(within(row).getByText(TRANSCRIPT_TITLE)).toBeTruthy();
  });

  it.each([
    ['processing', TRANSCRIPT_PROCESSING],
    ['failed', TRANSCRIPT_FAILED],
  ] as const)('state %s is on the row', (state, text) => {
    renderList([room({ transcriptionState: state })]);
    expect(screen.getByTestId('transcript-row').textContent).toContain(text);
  });

  it('ready and none add no state text', () => {
    renderList([room({ transcriptionState: 'ready' }), room({ id: 's2', roomId: 'room-2', transcriptionState: 'none' })]);
    for (const row of screen.getAllByTestId('transcript-row')) {
      expect(row.textContent).not.toContain(TRANSCRIPT_PROCESSING);
      expect(row.textContent).not.toContain(TRANSCRIPT_FAILED);
    }
  });

  it('is not dimmed as "abandoned" even though it has no rounds', () => {
    renderList([room()]);
    expect(screen.getByTestId('transcript-row').className).not.toMatch(/opacity-60/);
  });

  it('one click target: the Open button itself opens the session, once, with no handler on the card to bubble to', () => {
    const onClick = renderList([room({ chatName: 'Ben' })]);
    const row = screen.getByTestId('transcript-row');
    const open = within(row).getByRole('button', { name: /open/i });
    fireEvent.click(open);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].roomId).toBe('room-1');
    fireEvent.click(screen.getByText(/Ben/));
    expect(onClick, 'the card has no click handler of its own').toHaveBeenCalledTimes(1);
  });

  it('and it is the whole card: the Open button stretches over it (a ::after over the card), so a tap anywhere is a tap on it, and it takes the focus ring', () => {
    renderList([room({ chatName: 'Ben' })]);
    const row = screen.getByTestId('transcript-row');
    expect(row.className).toMatch(/\brelative\b/);
    const open = within(row).getByRole('button', { name: /open/i });
    expect(open.className).toMatch(/after:absolute/);
    expect(open.className).toMatch(/after:inset-0/);
    expect(row.className, 'the card shows the keyboard focus the button gets').toMatch(/focus-within:ring/);
  });

  it('reads as clickable: a bordered card, a 64px target, text that truncates instead of overflowing (375 / 320)', () => {
    renderList([room({ chatName: 'A very long chat name that would overflow a 320 pixel wide phone screen if it were allowed' })]);
    const row = screen.getByTestId('transcript-row');
    expect(row.className).toMatch(/\bborder\b/);
    expect(row.className).toMatch(/min-h-\[64px\]/);
    expect(row.className).toMatch(/w-full/);
    expect(row.className).toMatch(/cursor-pointer/);   // the stretched button makes the whole card its target
    const longText = screen.getByText(/A very long chat name/);
    expect(longText.className).toMatch(/truncate/);
    expect(longText.closest('.min-w-0')).not.toBeNull();
    expect(row.outerHTML).not.toMatch(/\bw-\[(?:3[3-9]\d|[4-9]\d\d)px\]/);   // no fixed width past a 320 screen
  });

  it('final look: a visible "Open" button replaces the chevron; it is the design system\'s details button (ghost), 44px, and the only button', () => {
    const onClick = renderList([room({ chatName: 'Ben' })]);
    const row = screen.getByTestId('transcript-row');
    expect(row.querySelector('svg.lucide-chevron-right'), 'the chevron is gone').toBeNull();
    const open = within(row).getByRole('button', { name: /open/i });
    expect(open.textContent).toContain('Open');
    expect(open.className).toMatch(/min-h-11/);
    expect(open.className, 'ghost: transparent at rest, no solid fill').not.toMatch(/bg-primary|bg-blue/);
    expect(within(row).getAllByRole('button'), 'one control, one tab stop').toHaveLength(1);
    fireEvent.click(open);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has an accessible name that says what it is and where the text stands', () => {
    renderList([room({ chatName: 'Ben', transcriptionState: 'processing' })]);
    const name = screen.getByRole('button', { name: /transcript/i }).getAttribute('aria-label') ?? '';
    expect(name).toMatch(/^Open/);
    expect(name).toContain('Ben');
    expect(name).toContain(TRANSCRIPT_PROCESSING);
  });
});

describe('a real rounds session is unchanged', () => {
  it('still says its rounds and its partner', () => {
    renderList([{ ...base, id: 's9', roundCount: 2, partnerName: 'Pat' }]);
    const row = screen.getByRole('button', { name: /session with pat/i });
    expect(row.textContent).toContain('2 rounds');
    expect(row.textContent).toContain('Pat');
  });
  it('and a session with none is still de-emphasized as abandoned', () => {
    renderList([{ ...base, id: 's9', roundCount: 0, partnerName: 'Pat', transcriptStatus: null as unknown as SessionSummary['transcriptStatus'] }]);
    expect(screen.getByRole('button', { name: /session with pat/i }).className).toMatch(/opacity-60/);
  });
});

describe('review 4: a processing row uses the still clock, not a spinner (same as the chat line and the session note)', () => {
  it('has no animate-spin anywhere in the row', () => {
    renderList([room({ transcriptionState: 'processing' })]);
    const row = screen.getByTestId('transcript-row');
    expect(row.innerHTML).not.toMatch(/animate-spin/);
    expect(row.querySelector('svg.lucide-clock')).not.toBeNull();
  });
});
