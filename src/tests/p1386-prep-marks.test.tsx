/**
 * P1386 — the host's ✓ prepared / 🎙 mic marks: which rows carry them, the mic line, and that a
 * tap (not only hover) explains each mark. Plus the source guards: the event page no longer has
 * the separate Preparation card, and the room reads the marks only through the host view.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { PrepMarks, micLine, prepMarksByProfile } from '@/app/prototypes/events/prep/PrepMarks';
import type { HostPrepRow } from '@/app/data/event-prep-service';

const row = (over: Partial<HostPrepRow>): HostPrepRow => ({
  profileId: 'user-id-1', name: 'Test', slug: 'test', hasPledged: false, prepChoice: null, stepsDone: [],
  startedAt: null, completedAt: null, optedIn: null, principleRating: null, researchState: null, micSetup: null,
  positionsDone: 0, positionsTotal: 0, ...over,
});

describe('prepMarksByProfile', () => {
  it('marks prepared people and confirmed volunteers only', () => {
    const marks = prepMarksByProfile([
      row({ profileId: 'a', completedAt: 'x' }),
      row({ profileId: 'b', researchState: 'confirmed', micSetup: 'usbc' }),
      row({ profileId: 'c', completedAt: 'x', researchState: 'confirmed', micSetup: 'own' }),
      row({ profileId: 'd', researchState: 'declined', micSetup: 'usbc' }),
      row({ profileId: 'e', startedAt: 'x' }),
    ]);
    expect(marks.get('a')).toEqual({ prepared: true, mic: null });
    expect(marks.get('b')).toEqual({ prepared: false, mic: 'usbc' });
    expect(marks.get('c')).toEqual({ prepared: true, mic: 'own' });
    expect(marks.has('d')).toBe(false); // declined: no mic mark
    expect(marks.has('e')).toBe(false); // started, not finished: no mark
  });
});

describe('micLine', () => {
  it('only when a USB-C mic is needed', () => {
    expect(micLine(prepMarksByProfile([row({ researchState: 'confirmed', micSetup: 'own' })]))).toBeNull();
    expect(micLine(prepMarksByProfile([row({ profileId: 'a', researchState: 'confirmed', micSetup: 'usbc' })]))).toBe('Bring 1 USB-C mic');
    expect(micLine(prepMarksByProfile([
      row({ profileId: 'a', researchState: 'confirmed', micSetup: 'usbc' }),
      row({ profileId: 'b', researchState: 'confirmed', micSetup: 'usbc' }),
    ]))).toBe('Bring 2 USB-C mics');
  });
});

describe('PrepMarks', () => {
  it('renders nothing without marks', () => {
    const { container } = render(<PrepMarks marks={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('a tap explains the check and the mic', () => {
    render(<PrepMarks marks={{ prepared: true, mic: 'usbc' }} />);
    fireEvent.click(screen.getByTestId('prep-mark-prepared'));
    expect(screen.getByTestId('prep-mark-note')).toHaveTextContent('Prepared for the event');
    fireEvent.click(screen.getByTestId('prep-mark-prepared'));
    fireEvent.click(screen.getByTestId('prep-mark-mic-usbc'));
    expect(screen.getByTestId('prep-mark-note')).toHaveTextContent('Needs a USB-C mic');
  });

  it('own mic says so', () => {
    render(<PrepMarks marks={{ prepared: false, mic: 'own' }} />);
    expect(screen.queryByTestId('prep-mark-prepared')).toBeNull();
    expect(screen.getByLabelText('Brings own mic')).toBeInTheDocument();
  });
});

describe('source guards', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
  it('the event page has no separate Preparation card', () => {
    expect(src('app/prototypes/events/components/EventDetail.tsx')).not.toMatch(/PrepHostList/);
  });
  it('the room reads marks only through the host-only view', () => {
    const room = src('app/prototypes/events/components/EventRoomMeet.tsx');
    expect(room).not.toMatch(/get_event_room_prepared|getRoomPrepared/);
    expect(room).toMatch(/useHostPrepMarks\(event\?\.id, isHost &&/);
  });
});

describe('useHostPrepMarks', () => {
  it('clears the marks when the viewer stops being the host', async () => {
    const { renderHook, waitFor } = await import('@testing-library/react');
    const svc = await import('@/app/data/event-prep-service');
    const spy = vi.spyOn(svc, 'getPrepHostView').mockResolvedValue([row({ profileId: 'a', completedAt: 'x' })]);
    const { useHostPrepMarks } = await import('@/app/prototypes/events/prep/PrepMarks');
    const { result, rerender } = renderHook(({ on }) => useHostPrepMarks('ev', on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.has('a')).toBe(true));
    rerender({ on: false });
    expect(result.current.size).toBe(0);
    spy.mockRestore();
  });
});
