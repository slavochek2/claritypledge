// @vitest-environment jsdom
/**
 * P1675 sections 1 to 3b: the hike registration form. Every string verbatim from the spec; "later" only strictly before the
 * start minus 24 hours; Transport lead only with "I need a ride" and cleared when the transport changes; free seats 0 to 20 for
 * a driver with the WhatsApp nudge at 1 or more; role instructions on choice; Other with its placeholder and 280 limit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const toastFn = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: toastFn }));

import { HikeRegistrationQuestions, hikeMissingKeys, seatsOf } from '@/app/prototypes/events/components/HikeRegistrationQuestions';
import { SOCIAL_HIKE_RECIPE } from '@/app/prototypes/events/series-recipes';
import { laterAllowed, type HikeAnswers } from '@/app/data/hike-answer-model';

const FAR = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
const NEAR = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
const onSubmit = vi.fn();
const open = (over: Partial<Parameters<typeof HikeRegistrationQuestions>[0]> = {}) =>
  render(<HikeRegistrationQuestions open datetime={FAR} minutes={9} busy={false} onCancel={vi.fn()} onSubmit={onSubmit} {...over} />);
const pick = (id: string) => fireEvent.click(screen.getByTestId(id));
const submit = () => fireEvent.click(screen.getByTestId('hike-registration-submit'));

beforeEach(() => vi.clearAllMocks());

describe('P1675 hike form: copy', () => {
  it('lead line, the two options and the privacy line, verbatim, with the computed minutes in both places', () => {
    open();
    expect(screen.getByTestId('hike-lead-line').textContent).toBe('Everyone does a short introduction before the hike. When will you do it?'); // UAT round 1 R1: no minutes
    expect(screen.getByLabelText("I have 9 minutes, I'll do it now")).toBeTruthy();
    expect(screen.getByLabelText("I'll do it later, remind me by email")).toBeTruthy();
    expect(screen.getByText('Only you and the host see these answers.')).toBeTruthy();
  });

  it('transport and help questions and options, verbatim', () => {
    open();
    expect(screen.getByText('How are you coming?')).toBeTruthy();
    for (const l of ['Car', 'Motorbike', 'Bicycle or on foot', 'I need a ride']) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(screen.getByText('How would you like to take part?')).toBeTruthy(); // UAT round 1 R3
    expect(screen.getByTestId('hike-help-line').textContent).toBe('This is a social, non-commercial hike: nobody is paid, so a few of us help run it.'); // R3 line
    for (const l of ['Just attend as a participant', 'Lead', 'Sweep', 'Welcomer', 'Other']) expect(screen.getByLabelText(l)).toBeTruthy();
  });

  it('R10: the "now" option says the recipe\'s stated minutes', () => {
    const stated = SOCIAL_HIKE_RECIPE.prepare.statedMinutes;
    open({ minutes: stated });
    expect(screen.getByLabelText(`I have ${stated} minutes, I'll do it now`)).toBeTruthy();
    expect(stated).toBe(15);
  });

  it('the lead line carries no number; the "now" option prints the minutes it is given', () => {
    open({ minutes: 14 });
    expect(screen.getByTestId('hike-lead-line').textContent).not.toMatch(/\d/);
    expect(screen.getByLabelText("I have 14 minutes, I'll do it now")).toBeTruthy();
  });
});

describe('P1675 hike form: the 24 hour rule', () => {
  it('inside 24 hours only "now" renders', () => {
    open({ datetime: NEAR });
    expect(screen.getByTestId('hike-when-now')).toBeTruthy();
    expect(screen.queryByTestId('hike-when-later')).toBeNull();
  });

  it('a server refusal (nowOnly) hides "later" and clears a "later" answer, keeping the others', () => {
    const initial: HikeAnswers = { when: 'later', transport: 'car', freeSeats: 3, help: 'welcomer', helpOther: null };
    open({ nowOnly: true, initial });
    expect(screen.queryByTestId('hike-when-later')).toBeNull();
    expect((screen.getByTestId('hike-when-now') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('hike-transport-car') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('hike-free-seats') as HTMLInputElement).value).toBe('3');
    expect((screen.getByTestId('hike-help-welcomer') as HTMLInputElement).checked).toBe(true);
  });

  it('an OPEN form that had "later" picked, refused as now_only, does not resend "later" (no refusal loop)', () => {
    // The live transition: the person picked "later", the server said now_only, the same mounted form receives
    // nowOnly and the kept answers. Submitting again must ask for "when", never send the hidden "later" (review 2026-11-17).
    const { rerender } = open();
    pick('hike-when-later'); pick('hike-transport-need_ride');
    const kept: HikeAnswers = { when: 'later', transport: 'need_ride', freeSeats: null, help: null, helpOther: null };
    rerender(<HikeRegistrationQuestions open datetime={FAR} minutes={9} busy={false} onCancel={vi.fn()} onSubmit={onSubmit} nowOnly initial={kept} />);
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('missing-when')).toBeTruthy();
    pick('hike-when-now'); submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ when: 'now', transport: 'need_ride' }));
  });

  it('laterAllowed is strict at start minus 24 h 30 min (the reminder cron margin)', () => {
    const start = Date.parse('2026-12-10T10:00:00Z');
    const cutoff = start - (24 * 60 + 30) * 60 * 1000;
    expect(laterAllowed('2026-12-10T10:00:00Z', cutoff - 1)).toBe(true);
    expect(laterAllowed('2026-12-10T10:00:00Z', cutoff)).toBe(false);
    expect(laterAllowed('not a date', 0)).toBe(false);
  });
});

describe('P1675 hike form: transport, seats and roles', () => {
  it('Transport lead is offered only with "I need a ride" and is cleared when the transport changes', () => {
    open();
    expect(screen.queryByTestId('hike-help-transport_lead')).toBeNull();
    pick('hike-transport-need_ride');
    pick('hike-help-transport_lead');
    expect(screen.getByTestId('hike-role-instructions').textContent).toContain('You help people who need a ride get there together.');
    pick('hike-transport-bike_or_foot');
    expect(screen.queryByTestId('hike-help-transport_lead')).toBeNull();
    expect(screen.queryByTestId('hike-role-instructions')).toBeNull();
    pick('hike-transport-need_ride');
    expect((screen.getByTestId('hike-help-transport_lead') as HTMLInputElement).checked).toBe(false);
  });

  it('free seats appear for Car and Motorbike only; the WhatsApp line needs 1 or more', () => {
    open();
    expect(screen.queryByTestId('hike-free-seats')).toBeNull();
    pick('hike-transport-motorbike');
    const seats = screen.getByTestId('hike-free-seats');
    fireEvent.change(seats, { target: { value: '0' } });
    expect(screen.queryByTestId('hike-whatsapp-line')).toBeNull();
    fireEvent.change(seats, { target: { value: '2' } });
    expect(screen.getByTestId('hike-whatsapp-line').textContent).toBe("Post your free seats in the hike's WhatsApp group, so people can ride with you.");
    pick('hike-transport-bike_or_foot');
    expect(screen.queryByTestId('hike-free-seats')).toBeNull();
    expect(screen.queryByTestId('hike-whatsapp-line')).toBeNull();
  });

  it('seatsOf accepts whole numbers 0 to 20 only', () => {
    expect(seatsOf('0')).toBe(0);
    expect(seatsOf('20')).toBe(20);
    for (const bad of ['', '21', '-1', '2.5', 'a', '100']) expect(seatsOf(bad)).toBeNull();
  });

  it('a role shows its instructions; Lead and Sweep carry the offline maps line; Other has none', () => {
    open();
    pick('hike-help-lead');
    expect(screen.getByTestId('hike-role-instructions').textContent).toContain('You set the pace at the front');
    expect(screen.getByTestId('hike-role-instructions').textContent).toContain('install AllTrails');
    pick('hike-help-welcomer');
    expect(screen.getByTestId('hike-role-instructions').textContent).toBe("Welcomer: what you'll do" + 'You greet people as they arrive at the meeting point, so nobody stands around lost.'); // UAT round 1 R4: heading above the text
    pick('hike-help-other');
    expect(screen.queryByTestId('hike-role-instructions')).toBeNull();
  });

  it('Other opens a box with the approved placeholder, limited to 280 characters', () => {
    open();
    pick('hike-help-other');
    const box = screen.getByTestId('hike-help-other-text') as HTMLTextAreaElement;
    expect(box.placeholder).toBe('For example: dog food for the trail dogs, sweets to share, a bag to collect rubbish on the way');
    expect(box.maxLength).toBe(280);
  });

  it('R3: "Just attend" is selected on open and submits help null; a role is dropped by choosing it, not by tapping again', () => {
    open();
    expect((screen.getByTestId('hike-help-none') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('This is a social, non-commercial hike: nobody is paid, so a few of us help run it.')).toBeTruthy();
    pick('hike-transport-bike_or_foot'); pick('hike-when-now');
    pick('hike-help-sweep');
    pick('hike-help-sweep'); // no tap-to-uncheck: still Sweep
    expect((screen.getByTestId('hike-help-sweep') as HTMLInputElement).checked).toBe(true);
    pick('hike-help-none');
    submit();
    expect(onSubmit).toHaveBeenCalledWith({ when: 'now', transport: 'bike_or_foot', freeSeats: null, help: null, helpOther: null });
  });

  it('R3: a cleared Transport lead falls back to "Just attend"', () => {
    open();
    pick('hike-transport-need_ride'); pick('hike-help-transport_lead');
    pick('hike-transport-car');
    expect((screen.getByTestId('hike-help-none') as HTMLInputElement).checked).toBe(true);
  });

  it('R4: each role shows its heading with the display label above its text', () => {
    open();
    pick('hike-transport-need_ride');
    for (const [id, label] of [['lead', 'Lead'], ['sweep', 'Sweep'], ['welcomer', 'Welcomer'], ['transport_lead', 'Transport lead']]) {
      pick(`hike-help-${id}`);
      expect(screen.getByTestId('hike-role-heading').textContent).toBe(`${label}: what you'll do`);
    }
    pick('hike-help-other');
    expect(screen.queryByTestId('hike-role-heading')).toBeNull();
  });

  it('R2: "I need a ride" shows the ride line; no other transport does', () => {
    open();
    expect(screen.queryByTestId('hike-ride-line')).toBeNull();
    pick('hike-transport-need_ride');
    expect(screen.getByTestId('hike-ride-line').textContent).toBe("After you register, you'll get the hike's WhatsApp group. Rides are arranged there.");
    pick('hike-transport-car');
    expect(screen.queryByTestId('hike-ride-line')).toBeNull();
    pick('hike-transport-bike_or_foot');
    expect(screen.queryByTestId('hike-ride-line')).toBeNull();
  });
});

describe('P1675 hike form: R6 questions per event', () => {
  it('transport off: no transport question, seats, ride line or Transport lead; submits transport null', () => {
    open({ asks: { transport: false, help: true } });
    expect(screen.queryByText('How are you coming?')).toBeNull();
    expect(screen.queryByTestId('hike-transport-car')).toBeNull();
    expect(screen.queryByTestId('hike-free-seats')).toBeNull();
    expect(screen.queryByTestId('hike-ride-line')).toBeNull();
    expect(screen.queryByTestId('hike-help-transport_lead')).toBeNull();
    pick('hike-when-now');
    submit();
    expect(onSubmit).toHaveBeenCalledWith({ when: 'now', transport: null, freeSeats: null, help: null, helpOther: null });
  });

  it('help off: no help question; submits help null even for kept answers', () => {
    open({ asks: { transport: true, help: false }, initial: { when: 'now', transport: 'bike_or_foot', freeSeats: null, help: null, helpOther: null } });
    expect(screen.queryByTestId('hike-help-none')).toBeNull();
    expect(screen.queryByText('How would you like to take part?')).toBeNull();
    submit();
    expect(onSubmit).toHaveBeenCalledWith({ when: 'now', transport: 'bike_or_foot', freeSeats: null, help: null, helpOther: null });
  });

  it('both off: only the "when" question is asked and a seat can be requested', () => {
    open({ asks: { transport: false, help: false } });
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('missing-when')).toBeTruthy();
    pick('hike-when-later'); submit();
    expect(onSubmit).toHaveBeenCalledWith({ when: 'later', transport: null, freeSeats: null, help: null, helpOther: null });
  });

  it('transport off keeps the other answers when redrawn after now_only', () => {
    const kept: HikeAnswers = { when: 'later', transport: null, freeSeats: null, help: 'welcomer', helpOther: null };
    open({ asks: { transport: false, help: true }, nowOnly: true, initial: kept });
    expect(screen.queryByTestId('hike-when-later')).toBeNull();
    expect((screen.getByTestId('hike-help-welcomer') as HTMLInputElement).checked).toBe(true);
    pick('hike-when-now'); submit();
    expect(onSubmit).toHaveBeenCalledWith({ when: 'now', transport: null, freeSeats: null, help: 'welcomer', helpOther: null });
  });

  it('stale kept answers (a ride and Transport lead, then transport turned off) are normalised: submit sends transport null and help null', () => {
    const stale: HikeAnswers = { when: 'now', transport: 'need_ride', freeSeats: null, help: 'transport_lead', helpOther: null };
    open({ asks: { transport: false, help: true }, initial: stale });
    expect(screen.queryByTestId('hike-help-transport_lead')).toBeNull();
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ when: 'now', transport: null, freeSeats: null, help: null, helpOther: null });
  });

  it('hikeMissingKeys skips unasked questions', () => {
    expect(hikeMissingKeys('now', null, '', null, '', { transport: false, help: true })).toEqual([]);
    expect(hikeMissingKeys('now', null, '', null, '')).toEqual(['transport']);
    expect(hikeMissingKeys(null, null, '', 'other', '', { transport: false, help: false })).toEqual(['when']);
  });
});

describe('P1675 hike form: submit', () => {
  it('a try with answers missing names each and sends nothing', () => {
    open();
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('missing-when').textContent).toBe('Choose when you will do it.');
    expect(screen.getByTestId('missing-transport').textContent).toBe('Choose how you are coming.');
  });

  it('a driver without seats, and Other without text, are missing', () => {
    expect(hikeMissingKeys('now', 'car', '', null, '')).toEqual(['seats']);
    expect(hikeMissingKeys('now', 'car', '21', null, '')).toEqual(['seats']);
    expect(hikeMissingKeys('now', 'bike_or_foot', '', 'other', '  ')).toEqual(['other']);
    expect(hikeMissingKeys('now', 'car', '0', 'other', 'sweets')).toEqual([]);
    // Over 280 after trimming is marked, never a silent no-op submit (review 2026-11-17).
    expect(hikeMissingKeys('now', 'bike_or_foot', '', 'other', 'a'.repeat(281))).toEqual(['other']);
    expect(hikeMissingKeys('now', 'bike_or_foot', '', 'other', ` ${'a'.repeat(280)} `)).toEqual([]);
  });

  it('sends the trimmed, normalised answers', () => {
    open();
    pick('hike-when-later'); pick('hike-transport-car');
    fireEvent.change(screen.getByTestId('hike-free-seats'), { target: { value: '3' } });
    pick('hike-help-other');
    fireEvent.change(screen.getByTestId('hike-help-other-text'), { target: { value: '  sweets to share ' } });
    submit();
    expect(onSubmit).toHaveBeenCalledWith({ when: 'later', transport: 'car', freeSeats: 3, help: 'other', helpOther: 'sweets to share' });
  });

  it('signed out the button reads Continue and the sign-in line shows', () => {
    open({ signedIn: false });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.getByTestId('sign-in-line')).toBeTruthy();
  });
});
