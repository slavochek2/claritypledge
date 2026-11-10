// @vitest-environment jsdom
/**
 * P1529 (founder 2026-11-10): the Sales Mastermind's room has the hikes' Feedback step: open at any time, and the phones land on it
 * when the host ends the evening. The recipe, the step bar and the real room are tested; the round card is a stand-in that reports
 * the evening's moment (it has its own tests), and the close flow itself is the hikes' (p1542-*).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShellTopBar, ShellTopBarProvider } from '@/app/components/layout/app-shell/shell-top-bar';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } } }) }));
const capture = vi.hoisted(() => ({ phase: 'idle', barVisible: false, isCapturingForEvent: () => false, startCapture: async () => ({ started: true }) }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => capture }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }), useOfflineStripShown: () => false }));
vi.mock('@/app/components/layout/app-shell/shell-nav', () => ({ useHideTodaysStripForEvent: () => {} }));
const room = vi.hoisted(() => ({ access: {} as Record<string, unknown> }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => ({ self: null, loading: false, refresh: vi.fn().mockResolvedValue(true), runSelfWrite: vi.fn() }),
}));
vi.mock('@/app/data/event-room-service', () => ({
  setRoomOptIn: vi.fn(), setRoomRating: vi.fn(), resetRoomAnswer: vi.fn(),
  subscribeToRoomRoster: () => Object.assign(() => {}, { refresh: () => {} }),
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => null }));
vi.mock('@/app/prototypes/events/prep/EventPrepPage', () => ({ PrepFlow: () => null }));
vi.mock('@/app/prototypes/events/prep/PrepPieces', () => ({ JoinOffer: () => null }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
  usePrepState: () => ({ loading: false, error: false, learned: true, progress: { done: 3 }, minutes: 0, reload: vi.fn() }),
}));
vi.mock('@/app/prototypes/events/components/PracticeRooms', () => ({ PracticeRooms: () => null }));
vi.mock('@/app/prototypes/events/use-feedback-finished', () => ({ useFeedbackFinished: () => false }));
// The round card reports the evening's moment; the test sets it.
const moment = vi.hoisted(() => ({ value: { seated: false, atTable: false, eveningOver: false, live: false, waiting: true } as Record<string, boolean> }));
vi.mock('@/app/prototypes/events/rounds/FlowRoundCard', async () => {
  const { useEffect } = await import('react');
  return {
    FlowRoundCard: ({ onMoment }: { onMoment: (m: Record<string, boolean>) => void }) => {
      useEffect(() => { onMoment(moment.value); }, [onMoment]);
      return <div data-testid="round-card-standin" />;
    },
  };
});

import { EventRoomMeet } from '@/app/prototypes/events/components/EventRoomMeet';
import { RoomSteps, canOpenStep } from '@/app/prototypes/events/rounds/RoomSteps';
import {
  CLARITY_NIGHT_RECIPE, SALES_MASTERMIND_RECIPE, SOCIAL_HIKE_RECIPE, feedbackAlwaysOpen, feedbackOpenAnytime, quoteConsentWords, recipeForEvent, resolveCloseSteps,
} from '@/app/prototypes/events/series-recipes';

const soon = (extra: Record<string, unknown>) => ({
  id: 'ev-1', slug: 'night', title: 'Evening', description: 'd', datetime: new Date(Date.now() - 60_000).toISOString(), timezone: 'UTC',
  durationMinutes: 240, location: 'Somewhere', hostId: 'h', hostName: 'H', hasGroupChat: false, preparationEnabled: false,
  statementTag: null, orgId: null, attendees: [], researchPlaces: 6, ...extra,
});

function renderRoom(event: Record<string, unknown>) {
  room.access = { slug: 'night', event, loading: false, granted: true, isLoggedIn: true, offline: false };
  return render(
    <ShellTopBarProvider enabled>
      <ShellTopBar />
      <MemoryRouter initialEntries={['/events/night/meet']}>
        <Routes><Route path="/events/:slug/meet" element={<EventRoomMeet />} /></Routes>
      </MemoryRouter>
    </ShellTopBarProvider>,
  );
}
const feedbackTab = () => screen.getByTestId('room-step-close') as HTMLButtonElement;

beforeEach(() => {
  sessionStorage.clear();
  moment.value = { seated: false, atTable: false, eveningOver: false, live: false, waiting: true };
});

describe('the recipe', () => {
  it('has the hikes\' feedback step shape, the series\' own quote box, and no Clarity Night next-event offer', () => {
    expect(SALES_MASTERMIND_RECIPE.room.feedbackAnytime).toBe(true);
    expect(SALES_MASTERMIND_RECIPE.room.feedbackAlwaysOpen, 'the current step stays the round\'s until the host ends the evening').toBe(false);
    expect(SALES_MASTERMIND_RECIPE.room.steps?.close).toBe('Feedback');
    expect(SALES_MASTERMIND_RECIPE.closeIntro).toBe(false);
    expect(SALES_MASTERMIND_RECIPE.cmpOneStep).toBe(true);
    expect(SALES_MASTERMIND_RECIPE.roomClose).toEqual({ title: null, body: 'Takes 2 minutes', heading: 'How was the evening?', cta: 'Start now', finished: 'Thanks, your feedback is in.' });
    expect(SALES_MASTERMIND_RECIPE.next, 'no "Join the next Clarity Night"').toBeNull();
    expect(SALES_MASTERMIND_RECIPE.appreciate).toBe(CLARITY_NIGHT_RECIPE.appreciate);
    expect('closeInApp' in SALES_MASTERMIND_RECIPE.room).toBe(false);
  });

  it('the close steps: the hikes\' list (no topic vote), one CMP step, the asks the server still offers', () => {
    const steps = resolveCloseSteps(SALES_MASTERMIND_RECIPE, { prepared: true, stanceCount: 3, asks: ['connect'] });
    expect(steps).toEqual(['score', 'positions', 'improve', 'appreciate', 'connect']);
    expect(resolveCloseSteps(SALES_MASTERMIND_RECIPE, { prepared: false, stanceCount: 3, asks: [] })).toEqual(['score', 'improve', 'appreciate']);
  });

  it('feedbackOpenAnytime: the mastermind and the hike, never Clarity Night; feedbackAlwaysOpen stays the hike\'s alone', () => {
    expect(feedbackOpenAnytime({ seriesSlug: 'sales-mastermind' })).toBe(true);
    expect(feedbackOpenAnytime({ seriesSlug: null, flow: 'sales-mastermind' })).toBe(true);
    expect(feedbackOpenAnytime({ seriesSlug: 'social-hike' })).toBe(true);
    expect(feedbackOpenAnytime({ seriesSlug: null })).toBe(false);
    expect(feedbackAlwaysOpen({ seriesSlug: 'sales-mastermind' })).toBe(false);
    expect(feedbackAlwaysOpen({ seriesSlug: 'social-hike' })).toBe(true);
    expect(recipeForEvent({ seriesSlug: 'social-hike' })).toBe(SOCIAL_HIKE_RECIPE);
  });
});

describe('quotes and consent in this series', () => {
  it('the mastermind series gets the quote BOX (Clarity Night\'s words), because the server derives consent by series and only the hike by writing', () => {
    expect(quoteConsentWords({ seriesSlug: 'sales-mastermind' })).toBe(CLARITY_NIGHT_RECIPE.appreciate);
    expect(quoteConsentWords({ seriesSlug: 'sales-mastermind' }).consent).toMatch(/You may quote me by name/);
    expect(quoteConsentWords({ seriesSlug: 'sales-mastermind' }).consentLine).toBeUndefined();
    expect(quoteConsentWords({ seriesSlug: 'social-hike' })).toBe(SOCIAL_HIKE_RECIPE.appreciate);
    // The server's list of series that take consent by writing, read from the migration itself (the artifact, not a note about it).
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261030120000_p1542_quote_consent_by_writing.sql'), 'utf-8');
    expect(sql).toMatch(/p_series = ANY \(ARRAY\['social-hike'\]\)/);
  });
});

describe('the step bar', () => {
  it('Feedback opens before it is the current step only where the series says so', () => {
    expect(canOpenStep('close', 'table')).toBe(false);
    expect(canOpenStep('close', 'table', true)).toBe(true);
    expect(canOpenStep('close', 'close')).toBe(true);
    // A tapped-back step never reopens the table once the evening is over, whatever closeOpen says.
    expect(canOpenStep('table', 'close', true)).toBe(false);
    const { rerender } = render(<RoomSteps current="table" viewing="table" onSelect={() => {}} hidden={['ready', 'compare']} />);
    expect((screen.getByTestId('room-step-close') as HTMLButtonElement).disabled).toBe(true);
    rerender(<RoomSteps current="table" viewing="table" onSelect={() => {}} hidden={['ready', 'compare']} closeOpen />);
    expect((screen.getByTestId('room-step-close') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('the room', () => {
  const mastermind = () => soon({ seriesSlug: 'sales-mastermind' });

  it('during the evening Feedback is a tap away, with the mastermind\'s own words, and the room stays on the round\'s step', () => {
    moment.value = { seated: true, atTable: false, eveningOver: false, live: true, waiting: false };
    renderRoom(mastermind());
    expect(screen.getByTestId('room-steps').getAttribute('data-current')).toBe('table');
    expect(feedbackTab().disabled).toBe(false);
    expect(feedbackTab().textContent).toBe('Feedback');
    expect(screen.queryByTestId('room-close')).toBeNull();
    fireEvent.click(feedbackTab());
    expect(screen.getByTestId('room-close-heading').textContent).toBe('How was the evening?');
    expect(screen.getByTestId('room-close-feedback').textContent).toBe('Start now');
    expect(screen.getByTestId('room-close-time').textContent).toBe('Takes 2 minutes');
    expect(screen.queryByText(/The evening has ended/)).toBeNull();
  });

  it('between rounds (the evening has not ended) the room does not move to Feedback', () => {
    moment.value = { seated: false, atTable: false, eveningOver: false, live: false, waiting: true };
    renderRoom(mastermind());
    expect(screen.getByTestId('room-steps').getAttribute('data-current')).not.toBe('close');
    expect(screen.queryByTestId('room-close')).toBeNull();
    expect(feedbackTab().disabled).toBe(false);
  });

  it('when the host ends the evening the phones land on Feedback by themselves; the table is no longer a step to go back to', () => {
    moment.value = { seated: false, atTable: false, eveningOver: true, live: false, waiting: false };
    renderRoom(mastermind());
    expect(screen.getByTestId('room-steps').getAttribute('data-current')).toBe('close');
    expect(screen.getByTestId('room-close-feedback')).toBeTruthy();
    expect((screen.getByTestId('room-step-table') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Clarity Night is unchanged: Feedback stays closed until the host ends the evening', () => {
    moment.value = { seated: true, atTable: false, eveningOver: false, live: true, waiting: false };
    renderRoom(soon({ seriesSlug: null }));
    expect(feedbackTab().disabled).toBe(true);
  });
});
