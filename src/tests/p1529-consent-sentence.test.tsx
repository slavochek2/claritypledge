// @vitest-environment jsdom
/** P1529 D13: the sentence reaches the terms, the policy, the notice and every consent in this flow; other flows' consent stays as it was. */
import { readFileSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUND_UPDATE_CONSENT } from '@/app/components/session/capture-copy';
import { TERMS_CHANGES } from '@/app/content/terms-changes';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';

const room = vi.hoisted(() => ({ eventId: 'e1' as string | null, row: { flow: null as string | null, series_slug: null as string | null } as object | null, fail: false }));
vi.mock('@/app/data/transcribe-service', () => ({ getRoomByCode: async () => ({ eventId: room.eventId }) }));
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => ({ phase: 'idle', isCapturingForEvent: () => false, startCapture: vi.fn(), subscribeLevel: () => () => {} }),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false }), useOfflineStripShown: () => false }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => (room.fail ? { data: null, error: { message: 'no' } } : { data: room.row, error: null }) }) }) }) },
}));

import { ConsentSection } from '@/app/pages/ConsentLabel';
import { RoomTranscribeIdleBar } from '@/app/components/session/room-capture-bar';

const SENTENCE = ROUND_UPDATE_CONSENT;
const show = (code: string) => render(<ConsentSection agreed={false} code={code} onToggle={() => {}} />);

describe('P1529 D13: the sentence', () => {
  beforeEach(() => { room.eventId = 'e1'; room.fail = false; });
  it('the terms and the privacy policy say so', () => {
    for (const f of ['src/app/content/tos.md', 'src/app/content/privacy.md']) expect(readFileSync(f, 'utf8')).toMatch(/Clarity Canvas owner's AI mirror to draft their next/);
  });
  it('the current terms notice says so without internal words', () => {
    expect(TERMS_CHANGES[CURRENT_TERMS_VERSION]?.headline).toContain("Clarity Canvas owner's AI mirror to draft their next version");
  });
  it('is the reviewed text without its links line, and the room\'s Transcribe text says it too', () => {
    expect(SENTENCE).toBe('We capture table conversations with a mic, and Google Gemini turns them into text in the event chat for the host and registered attendees. The peer whose Clarity Canvas you discuss can use AI to draft an update from your conversation transcript.');
    render(<RoomTranscribeIdleBar eventId="ev-1" displayName="Ana" roundUpdates onFailed={() => {}} />);
    expect(screen.getByTestId('room-transcribe-start')).toHaveAccessibleDescription(expect.stringContaining(SENTENCE));
  });
  it('shows in a mastermind room\'s consent, after the toggle is settled', async () => {
    room.row = { flow: null, series_slug: 'sales-mastermind' };
    show('MM1');
    await waitFor(() => expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain(SENTENCE));
    expect(screen.getByTestId('transcribe-recording-toggle')).toHaveProperty('disabled', false);
  });
  it('does not show on a Clarity Night or a plain room', async () => {
    room.row = { flow: null, series_slug: 'clarity-night' };
    show('CN1');
    await waitFor(() => expect(screen.getByTestId('transcribe-recording-toggle')).toHaveProperty('disabled', false));
    expect(screen.getByTestId('transcribe-consent-intro').textContent).not.toContain(SENTENCE);
  });
  it('a failed lookup over-discloses rather than hiding it', async () => {
    room.fail = true;
    show('XX1');
    await waitFor(() => expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain(SENTENCE));
  });
});
