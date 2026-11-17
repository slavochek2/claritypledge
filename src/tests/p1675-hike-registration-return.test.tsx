/**
 * P1675: the sign-up return (`?action=rsvp`) on a hike. Saved answers register without asking again; none opens the form;
 * a failed send reopens the form with the saved answers.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/data/events-service', () => ({ eventsService: { isEventFull: () => false } }));

import { useRegistrationReturn } from '@/app/prototypes/events/components/use-registration-return';
import { saveHikeDraft } from '@/app/data/registration-draft';
import type { HikeAnswers } from '@/app/data/hike-answer-model';

const ANSWERS: HikeAnswers = { when: 'later', transport: 'car', freeSeats: 2, help: 'sweep', helpOther: null };
const SOON = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();

function setup(over: { draft?: boolean; submit?: boolean } = {}) {
  const registration = {
    askHike: vi.fn(), keepHikeAnswers: vi.fn(), submitHike: vi.fn().mockResolvedValue(over.submit ?? true),
    ask: vi.fn(), keepAnswers: vi.fn(), submit: vi.fn(), markFilled: vi.fn(),
  };
  if (over.draft) saveHikeDraft('hike-1', ANSWERS);
  const event = { id: 'e1', slug: 'hike-1', seriesSlug: 'social-hike', status: 'published', datetime: SOON };
  renderHook(() => useRegistrationReturn({
    searchParams: new URLSearchParams('action=rsvp'), setSearchParams: vi.fn(), isLoggedIn: true,
    event: event as never, loading: false, asksBeforeSeat: true, isRsvpd: false, isHostOfEvent: false,
    registration: registration as never,
  }));
  return registration;
}

beforeEach(() => { localStorage.clear(); });

describe('useRegistrationReturn on a hike', () => {
  it('submits the saved draft without asking', async () => {
    const r = setup({ draft: true });
    await waitFor(() => expect(r.submitHike).toHaveBeenCalledWith(ANSWERS));
    expect(r.keepHikeAnswers).toHaveBeenCalledWith(ANSWERS);
    expect(r.askHike).not.toHaveBeenCalled();
    expect(r.submit).not.toHaveBeenCalled();
    expect(r.ask).not.toHaveBeenCalled();
  });

  it('with no draft the hike form opens', () => {
    const r = setup();
    expect(r.askHike).toHaveBeenCalledWith();
    expect(r.submitHike).not.toHaveBeenCalled();
    expect(r.ask).not.toHaveBeenCalled();
  });

  it('a failed send reopens the form with the saved answers', async () => {
    const r = setup({ draft: true, submit: false });
    await waitFor(() => expect(r.askHike).toHaveBeenCalledWith(ANSWERS));
    expect(r.submitHike).toHaveBeenCalledTimes(1);
  });

  it('a successful send does not reopen the form', async () => {
    const r = setup({ draft: true, submit: true });
    await waitFor(() => expect(r.submitHike).toHaveBeenCalled());
    await Promise.resolve();
    expect(r.askHike).not.toHaveBeenCalled();
  });
});
