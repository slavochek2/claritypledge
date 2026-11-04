/**
 * P1604 final-look batch, the transcript view (founder 2026-11-04): the standard Back, Copy on the title row (top right, also on a
 * phone), each speaker block with the chat's own avatar mark (ring for a pledger) and a name linking to their profile, a deleted
 * person as the chat shows one, and round sessions headed "Round N · Table M" in time order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const data = vi.hoisted(() => ({ transcript: null as unknown, people: new Map() as Map<string, unknown> }));
vi.mock('@/app/hooks/use-tonights-event', () => ({ useTonightsEvent: () => null }));
vi.mock('@/app/data/api', () => ({ fetchRoomTranscript: vi.fn(async () => data.transcript) }));
vi.mock('@/app/data/transcript-speakers', () => ({ fetchSpeakerPeople: vi.fn(async () => data.people) }));
vi.mock('@/app/data/room-transcription-state', () => ({ getMyRoomStates: vi.fn(async () => new Map()) }));

import { RoomTranscriptView } from '@/app/pages/room-transcript-view';

const seg = (over: Record<string, unknown>) => ({
  speakerLabel: 'Ada', startMs: 0, text: 'hello', alsoHeardBy: [], fromIncompleteRecording: false, memberId: 'm-ada', jobId: 'j1', ...over,
});
const ADA = { id: 'p-ada', name: 'Ada Lovelace', slug: 'ada', avatarUrl: null, avatarColor: '#3B82F6', hasPledged: true };
const BO = { id: 'p-bo', name: 'Bo Stone', slug: 'bo', avatarUrl: null, avatarColor: null, hasPledged: false };
const show = (title = 'Transcript · Ben', onBack = vi.fn()) => {
  render(<MemoryRouter><RoomTranscriptView roomId="room-1" title={title} initialState="ready" onBack={onBack} /></MemoryRouter>);
  return onBack;
};

beforeEach(() => {
  data.people = new Map([['m-ada', { kind: 'person', author: ADA }], ['m-bo', { kind: 'person', author: BO }]]);
  data.transcript = { source: 'final', segments: [seg({}), seg({ memberId: 'm-bo', speakerLabel: 'Bo', startMs: 5000, text: 'hi Ada' })], sections: [] };
});

describe('the transcript view header', () => {
  it('uses the standard Back (the shell\'s Back), which calls the view\'s own step back', async () => {
    const onBack = show();
    await screen.findByTestId('room-transcript');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has Copy ON the title row, top right, as the filled secondary button, 44px', async () => {
    show();
    await screen.findByTestId('room-transcript');
    const header = document.querySelector('[data-page-header]') as HTMLElement;
    expect(within(header).getByRole('heading', { name: 'Transcript · Ben' })).toBeTruthy();
    const copy = within(header).getByRole('button', { name: /copy transcript/i });
    expect(copy.className).toMatch(/min-h-11/);
    expect(copy.className).toMatch(/bg-secondary/);           // the filled secondary variant (founder), not a white outline
    expect(copy.className).not.toMatch(/border-input|bg-background/);
    expect(copy.className).not.toMatch(/bg-primary|bg-blue/);
    // right of the title in the same flex row
    const title = within(header).getByRole('heading');
    expect(title.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no Copy before there is text to copy (control)', async () => {
    data.transcript = { source: 'final', segments: [], sections: [] };
    show();
    await screen.findByTestId('room-transcript-empty');
    expect(screen.queryByRole('button', { name: /copy transcript/i })).toBeNull();
  });
});

describe('speaker blocks', () => {
  it('each shows the chat\'s avatar mark and a name that links to the profile', async () => {
    show();
    await screen.findByTestId('room-transcript');
    const ada = await screen.findByRole('link', { name: 'Ada Lovelace' });
    expect(ada.getAttribute('href')).toBe('/p/ada');
    expect(screen.getByRole('link', { name: "Open Ada Lovelace's profile" }).getAttribute('href')).toBe('/p/ada');
  });

  it('a pledger\'s avatar carries the clarity ring the chat uses; a non-pledger\'s does not', async () => {
    show();
    const blocks = await screen.findAllByRole('article');
    await waitFor(() => expect(within(blocks[0]).getByRole('link', { name: "Open Ada Lovelace's profile" })).toBeTruthy());
    const ringed = (el: HTMLElement) => /ring-blue-500/.test(el.innerHTML);
    expect(ringed(blocks[0]), 'Ada is a pledger').toBe(true);
    expect(ringed(blocks[1]), 'Bo is not').toBe(false);
  });

  it('a deleted person shows as the chat shows one: "Deleted user" with the neutral mark, no link', async () => {
    data.people = new Map([['m-ada', { kind: 'deleted' }]]);
    data.transcript = { source: 'final', segments: [seg({})], sections: [] };
    show();
    const block = await screen.findByRole('article');
    await waitFor(() => expect(within(block).getByText('Deleted user')).toBeTruthy());
    expect(within(block).queryByRole('link')).toBeNull();
  });

  it('text with no member ids (the older text) keeps the plain speaker label', async () => {
    data.transcript = { source: 'live', segments: [{ speakerLabel: 'Cy', startMs: 0, text: 'old', alsoHeardBy: [], fromIncompleteRecording: false }], sections: [] };
    show();
    const block = await screen.findByRole('article');
    expect(within(block).getByText('Cy')).toBeTruthy();
  });
});

describe('round sessions: headings in time order', () => {
  it('heads each block "Round N · Table M", and the outside stretches by their place', async () => {
    data.transcript = {
      source: 'final',
      segments: [
        seg({ jobId: 'jb', text: 'before words' }),
        seg({ jobId: 'j1', text: 'round one words', startMs: 1000 }),
        seg({ jobId: 'j2', text: 'round two words', startMs: 2000 }),
        seg({ jobId: 'je', text: 'after words', startMs: 3000 }),
      ],
      sections: [
        { jobId: 'jb', kind: 'room', place: 'before', roundNo: null, tableNo: null },
        { jobId: 'j1', kind: 'round', place: null, roundNo: 1, tableNo: 2 },
        { jobId: 'j2', kind: 'round', place: null, roundNo: 2, tableNo: 4 },
        { jobId: 'je', kind: 'room', place: 'end', roundNo: null, tableNo: null },
      ],
    };
    show();
    await screen.findByTestId('room-transcript');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Before round 1', 'Round 1 · Table 2', 'Round 2 · Table 4', 'After the last round']);
  });

  it('a plain session (one room job, no event) gets no headings at all', async () => {
    data.transcript = { source: 'final', segments: [seg({})], sections: [{ jobId: 'j1', kind: 'room', place: 'session', roundNo: null, tableNo: null }] };
    show();
    await screen.findByTestId('room-transcript');
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });
});
