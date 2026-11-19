/**
 * @file p1675-r20-mastermind-when.test.tsx
 * @description P1675 UAT round 4 R20 and the round-4 review fold: the mastermind's now / later / event answers, the 24-hour rule,
 * storage mapping, the draft keeping the UI choice, and the hike's notice and host label.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: vi.fn() }));

import { RegistrationQuestions } from '@/app/prototypes/events/components/RegistrationQuestions';
import { prepOptions } from '@/app/prototypes/events/components/registration-copy';
import { participationOf } from '@/app/data/registration-answer-model';
import { clearRegistrationDraft, readRegistrationDraft, saveRegistrationDraft } from '@/app/data/registration-draft';
import { HIKE_HOST_WHEN, HIKE_NOW_ONLY_NOTICE } from '@/app/prototypes/events/components/hike-copy';

const DATETIME = '2026-11-14T11:30:00+00:00';
const ANSWERS = { participation: 'canvas_before', observerPrep: null, phone: 'usbc', hope: '', recordingAccepted: true } as const;
const NOW = "I have 15 minutes, I'll do it now";
const LATER = "I'll do it later, remind me by email";
const EVENT = "I'll come 15 minutes early and do it there";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

const open = (over: Partial<Parameters<typeof RegistrationQuestions>[0]> = {}) =>
  render(<RegistrationQuestions open datetime={DATETIME} timezone="Asia/Bangkok" busy={false} onCancel={vi.fn()} onSubmit={vi.fn()} {...over} />);

describe('R20 labels and the 24-hour rule', () => {
  it('offers the three answers in order, with the verbatim labels', () => {
    expect(prepOptions('improve', '18:00').map(o => o.label)).toEqual([NOW, LATER, EVENT]);
  });
  it('hides later when it is not offered; the canvas-before wording is unchanged', () => {
    expect(prepOptions('improve', '18:00', 'at_event', false).map(o => o.value)).toEqual(['now', 'event']);
    expect(prepOptions('improve', '18:00', 'before').map(o => o.label)).toEqual(['At home, before the event', "I'll come earlier, at 18:00, and prepare there"]);
  });
  it('the form hides later inside start minus 24h30 and shows it before', () => {
    open();
    fireEvent.click(screen.getByTestId('join-improve'));
    expect(screen.queryByTestId('prep-later')).not.toBeNull();
    cleanup();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z')); // 23.5 hours before the start
    open();
    fireEvent.click(screen.getByTestId('join-improve'));
    expect(screen.queryByTestId('prep-later')).toBeNull();
    expect(screen.queryByTestId('prep-now')).not.toBeNull();
    expect(screen.queryByTestId('prep-event')).not.toBeNull();
  });
});

describe('R20 storage mapping', () => {
  it('now and later never reach the doors; only event does', () => {
    for (const prep of ['now', 'later', 'home'] as const) {
      expect(participationOf('improve', prep)).toEqual({ participation: 'canvas_before', observerPrep: null });
      expect(participationOf('help', prep)).toEqual({ participation: 'observer', observerPrep: 'home' });
    }
    expect(participationOf('improve', 'event')).toEqual({ participation: 'canvas_at_doors', observerPrep: null });
    expect(participationOf('help', 'event')).toEqual({ participation: 'observer', observerPrep: 'doors' });
  });
  it('the form hands the UI choice up with the answers (now routes to the preparation page from it)', () => {
    const onSubmit = vi.fn();
    open({ onSubmit });
    fireEvent.click(screen.getByTestId('join-improve'));
    fireEvent.click(screen.getByTestId('prep-now'));
    fireEvent.click(screen.getByLabelText('USB-C'));
    fireEvent.click(screen.getByTestId('recording-accept'));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith(ANSWERS, { prep: 'now' });
  });
  it('a saved home answer restores as later', () => {
    open({ initial: ANSWERS });
    expect((screen.getByTestId('prep-later') as HTMLInputElement).checked).toBe(true);
  });
  it('a kept now restores as now; a kept later is dropped once later is not offered', () => {
    open({ initial: ANSWERS, initialPrep: 'now' });
    expect((screen.getByTestId('prep-now') as HTMLInputElement).checked).toBe(true);
    cleanup();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    open({ initial: ANSWERS, initialPrep: 'later' });
    expect(screen.queryByTestId('prep-later')).toBeNull();
    expect((screen.getByTestId('prep-now') as HTMLInputElement).checked).toBe(false);
  });
});

describe('R20 draft keeps the UI choice through sign-in', () => {
  it('stores now / later / event and returns it; an unknown value is not kept', () => {
    for (const prep of ['now', 'later', 'event'] as const) {
      saveRegistrationDraft('slug', 'register', ANSWERS, Date.now(), prep);
      expect(readRegistrationDraft('slug')?.prep).toBe(prep);
    }
    saveRegistrationDraft('slug', 'register', ANSWERS, Date.now(), 'bogus' as never);
    expect(readRegistrationDraft('slug')?.prep).toBeUndefined();
    saveRegistrationDraft('slug', 'register', ANSWERS);
    expect(readRegistrationDraft('slug')?.prep).toBeUndefined();
    clearRegistrationDraft('slug');
  });
});

describe('round-4 fold: hike words', () => {
  it('the redrawn form notice and the host label', () => {
    expect(HIKE_NOW_ONLY_NOTICE).toBe('The hike is less than 24 hours away, so the reminder email cannot reach you in time. Do it now or at the meeting point.');
    expect(HIKE_HOST_WHEN).toEqual({ now: 'Now', later: 'Later', event: 'At the meeting point' });
  });
});

// F5 (round-4 review fix): the cutoff is re-checked at submit, not only when the form opens.
describe('R20 a form left open across the cutoff', () => {
  it('does not submit "later" once it is no longer allowed: the choice is cleared and prep shows as missing', () => {
    const onSubmit = vi.fn();
    open({ onSubmit });
    fireEvent.click(screen.getByTestId('join-improve'));
    fireEvent.click(screen.getByTestId('prep-later'));
    fireEvent.click(screen.getByLabelText('USB-C'));
    fireEvent.click(screen.getByTestId('recording-accept'));
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z')); // the form stayed open past start minus 24h30
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('prep-later')).toBeNull();
    expect(screen.queryByTestId('missing-prep')).not.toBeNull();
    fireEvent.click(screen.getByTestId('prep-now'));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith(ANSWERS, { prep: 'now' });
  });
  it('a later chosen inside the cutoff still submits', () => {
    const onSubmit = vi.fn();
    open({ onSubmit });
    fireEvent.click(screen.getByTestId('join-improve'));
    fireEvent.click(screen.getByTestId('prep-later'));
    fireEvent.click(screen.getByLabelText('USB-C'));
    fireEvent.click(screen.getByTestId('recording-accept'));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith(ANSWERS, { prep: 'later' });
  });
});
