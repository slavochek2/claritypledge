/**
 * P1596: pieces the solo-test rounds added that had no test of their own: the collapsed rail's Today's event, the run
 * rule behind the single "Transcribed" label, the arrow-only Back below 360 px, and the room's claim on the bar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/mixpanel', () => ({ analytics: { track } }));

import { RailTodaysEvent } from '@/app/components/layout/app-shell/app-sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { continuesTranscription } from '@/app/pages/chat/transcription-run';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { claimRoomBar, useRoomBarClaimed } from '@/app/components/session/room-bar-owner';
import type { ChatMessage } from '@/app/data/chat-service';

beforeEach(() => track.mockClear());

describe('RailTodaysEvent (collapsed rail)', () => {
  const todays = (over: Record<string, unknown> = {}) => ({
    event: { slug: 'night', title: 'Clarity Night', datetime: '2026-11-02T12:00:00Z', durationMinutes: 60, preparationEnabled: false, registered: true, ...over },
    href: '/events/night/room',
    current: false,
  });
  const draw = (t: ReturnType<typeof todays>) =>
    render(<MemoryRouter><TooltipProvider><ul><RailTodaysEvent todays={t} /></ul></TooltipProvider></MemoryRouter>);

  it('is an icon link to the event, named for screen readers and titled with the event', () => {
    draw(todays());
    const link = screen.getByTestId('tonights-event-cta-rail');
    expect(link).toHaveAttribute('href', '/events/night/room');
    expect(link).toHaveAccessibleName("Today's event");
    expect(link).toHaveAttribute('title', 'Clarity Night');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('marks the page it is on', () => {
    draw({ ...todays(), current: true });
    expect(screen.getByTestId('tonights-event-cta-rail')).toHaveAttribute('aria-current', 'page');
  });

  it('counts a tap, with whether the person was registered', () => {
    draw(todays({ registered: false }));
    fireEvent.click(screen.getByTestId('tonights-event-cta-rail'));
    expect(track).toHaveBeenCalledWith('nav_cta_clicked', { cta: 'tonights_event', device: 'desktop', registered: false });
  });
});

describe('continuesTranscription', () => {
  const m = (over: Partial<ChatMessage>) => ({ isTranscription: true, isDeleted: false, authorId: 'a', ...over }) as ChatMessage;
  it('continues the run of one author\'s transcription lines', () => {
    expect(continuesTranscription(m({}), m({}))).toBe(true);
  });
  it('starts a new run for the first message, another author, a typed message, or after a deleted line', () => {
    expect(continuesTranscription(undefined, m({}))).toBe(false);
    expect(continuesTranscription(m({}), m({ authorId: 'b' }))).toBe(false);
    expect(continuesTranscription(m({}), m({ isTranscription: false }))).toBe(false);
    expect(continuesTranscription(m({ isTranscription: false }), m({}))).toBe(false);
    expect(continuesTranscription(m({ isDeleted: true }), m({}))).toBe(false);
  });
  it('starts a new run when the line opens a new block: after a day break, or under a new author header', () => {
    expect(continuesTranscription(m({}), m({}), true)).toBe(false);
    expect(continuesTranscription(m({}), m({}), false)).toBe(true);
  });
});

describe('FocusHeader arrowOnlyBelow360', () => {
  const label = (props: { arrowOnlyBelow360?: boolean }) => {
    render(<MemoryRouter><FocusHeader inPlace onBack={() => undefined} label="Event" aria-label="Back to the event" {...props} /></MemoryRouter>);
    return screen.getByText('Event');
  };
  it('shrinks the label to screen-reader text below 360 px', () => {
    expect(label({ arrowOnlyBelow360: true })).toHaveClass('max-[359px]:sr-only');
  });
  it('keeps the label everywhere otherwise', () => {
    expect(label({})).not.toHaveClass('max-[359px]:sr-only');
  });
  it('keeps the accessible name either way', () => {
    label({ arrowOnlyBelow360: true });
    expect(screen.getByRole('button', { name: 'Back to the event' })).toBeInTheDocument();
  });
});

describe('room-bar-owner', () => {
  it('is claimed while any page holds the claim, and free again when the last lets go', () => {
    const { result } = renderHook(() => useRoomBarClaimed());
    expect(result.current).toBe(false);
    let a!: () => void, b!: () => void;
    act(() => { a = claimRoomBar(); b = claimRoomBar(); });
    expect(result.current).toBe(true);
    act(() => a());
    expect(result.current).toBe(true);
    act(() => b());
    expect(result.current).toBe(false);
  });

  it('a claim released twice does not drop another page\'s claim', () => {
    const { result } = renderHook(() => useRoomBarClaimed());
    let a!: () => void, b!: () => void;
    act(() => { a = claimRoomBar(); b = claimRoomBar(); });
    act(() => { a(); a(); });
    expect(result.current).toBe(true);
    act(() => b());
    expect(result.current).toBe(false);
  });
});
