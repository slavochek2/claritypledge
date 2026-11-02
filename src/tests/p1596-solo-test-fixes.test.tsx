import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TermsMissedChanges } from '@/app/components/legal/terms-change-list';

const h = vi.hoisted(() => ({ eventId: 'e1' as string | null, resolve: vi.fn() }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => ({ eventId: h.eventId }) }));
vi.mock('@/app/data/event-chat-path', () => ({ EVENT_TEXT_ARRIVES: 'ARRIVES', resolveEventChatPath: h.resolve }));
vi.mock('@/app/components/layout/focus-header', () => ({ FocusHeader: ({ fallback }: { fallback: string }) => <span data-testid="back">{fallback}</span> }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: 'night' }, error: null }) }) }) }) },
}));

import { EndedEventNote, TranscribeRoomTop } from '@/app/pages/transcribe-room-event-links';

function mount(running = true) {
  return render(
    <MemoryRouter initialEntries={['/transcribe/ABC']}>
      <Routes>
        <Route path="/transcribe/ABC" element={<TranscribeRoomTop running={running} fallback="/" />} />
        <Route path="*" element={<p>landed</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the live text page of an event capture (P1596 solo test)', () => {
  beforeEach(() => { h.eventId = 'e1'; h.resolve.mockReset(); });

  it('says when the clean text comes, and Back falls back to the event room', async () => {
    mount();
    expect(screen.getByTestId('transcribe-event-note')).toHaveTextContent('ARRIVES');
    await waitFor(() => expect(screen.getByTestId('back')).toHaveTextContent('/events/night/room'));
  });

  it('resolves the chat on the tap, so a round change cannot leave an old table', async () => {
    h.resolve.mockResolvedValue('/chats/c/c1');
    mount();
    expect(h.resolve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('transcribe-open-chat'));
    expect(await screen.findByText('landed')).toBeInTheDocument();
  });

  it('a failed read says so and can be tried again', async () => {
    h.resolve.mockRejectedValueOnce(new Error('down'));
    mount();
    fireEvent.click(screen.getByTestId('transcribe-open-chat'));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened');
  });

  it('a lookup still pending when the page goes away does not navigate', async () => {
    let finish: (p: string) => void = () => {};
    h.resolve.mockReturnValue(new Promise<string>((r) => { finish = r; }));
    const view = mount();
    fireEvent.click(screen.getByTestId('transcribe-open-chat'));
    fireEvent.click(screen.getByTestId('transcribe-open-chat'));
    expect(h.resolve).toHaveBeenCalledTimes(1);
    view.unmount();
    finish('/chats/c/c1');
    await Promise.resolve();
    expect(screen.queryByText('landed')).toBeNull();
  });

  it('another room has no note and the plain fallback', () => {
    h.eventId = null;
    mount();
    expect(screen.queryByTestId('transcribe-event-note')).toBeNull();
    expect(screen.getByTestId('back')).toHaveTextContent('/');
  });
});

describe('the ended screen note (P1596 solo test)', () => {
  it('shows after an event capture, not after a later room without an event', () => {
    h.eventId = 'e1';
    mount().unmount();
    render(<EndedEventNote />).unmount();
    h.eventId = 'e1';
    const first = render(<EndedEventNote />);
    expect(first.getByTestId('transcribe-ended-event-note')).toHaveTextContent('ARRIVES');
    first.unmount();
    mount(false).unmount();
    expect(render(<EndedEventNote />).queryByTestId('transcribe-ended-event-note')).toBeNull();
  });
});

describe('missed terms changes (P1596 solo test)', () => {
  it('show what forced the popup, with the detail closed', () => {
    render(<TermsMissedChanges missed={[{ title: 't', headline: 'old change', highlights: ['x'], requiresConsent: true, kind: 'feature' }]} />);
    expect(screen.getByText('old change')).toBeInTheDocument();
    expect((screen.getByTestId('terms-missed').querySelector('details') as HTMLDetailsElement).open).toBe(false);
  });
});
