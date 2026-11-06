// @vitest-environment jsdom
/**
 * P1529 D24: the registration form, as the founder gave it (2026-11-05). The two-step join question has two branches, each
 * with its own second question; changing the first answer clears the second; Register is always tappable and names what is
 * missing; closing keeps the answers and says so only if there were any. Signed out, the form ends in Continue.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const toastFn = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: toastFn }));

import { RegistrationQuestions, PlacesLeftLine, missingLines } from '@/app/prototypes/events/components/RegistrationQuestions';
import { ROUND_UPDATE_CONSENT, ROUND_UPDATE_CONSENT_LINKS } from '@/app/components/session/capture-copy';
import { formatDoorsTime, formatStartTime } from '@/app/prototypes/events/event-doors';

const DATETIME = '2026-11-14T11:30:00+00:00'; // 18:30 in Bangkok, doors 18:00
const base = { datetime: DATETIME, timezone: 'Asia/Bangkok', busy: false, onCancel: vi.fn() };
const open = (over: Partial<Parameters<typeof RegistrationQuestions>[0]> = {}) =>
  render(<RegistrationQuestions open {...base} onSubmit={vi.fn()} {...over} />);

beforeEach(() => vi.clearAllMocks());

describe('P1529 D24 registration form: copy', () => {
  it('formats the start and the doors time in the event zone', () => {
    expect(formatStartTime(DATETIME, 'Asia/Bangkok')).toBe('18:30');
    expect(formatDoorsTime(DATETIME, 'Asia/Bangkok')).toBe('18:00');
  });

  it('title, the line under it, the first question and its two options, exactly as given', () => {
    open();
    expect(screen.getByRole('heading', { name: 'Register' })).toBeTruthy();
    expect(screen.getByText('Places are limited. If your plans change, please cancel so someone else can come.')).toBeTruthy();
    expect(screen.getByText('In which role would you like to participate?')).toBeTruthy();
    expect(screen.getByLabelText('I want to stress-test my riskiest business assumptions with peers')).toBeTruthy();
    expect(screen.getByLabelText('I want to help others succeed, as an observer or mentor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Register' })).toBeTruthy();
  });

  it('the second question is absent until the first is answered', () => {
    open();
    expect(screen.queryByTestId('prep-question')).toBeNull();
  });

  it('branch 1, owners: the second question asks WHEN (15 minutes); the doors time is formatted from the event', () => {
    open();
    fireEvent.click(screen.getByTestId('join-improve'));
    expect(screen.getByText('When will you invest 15 minutes to create your Clarity Canvas?')).toBeTruthy();
    expect(screen.getByLabelText('At home, before the event')).toBeTruthy();
    expect(screen.getByLabelText("I'll come earlier, at 18:00, and prepare there")).toBeTruthy();
  });

  it('the doors time follows the event, never a typed 18:00', () => {
    open({ datetime: '2026-11-14T12:00:00+00:00' }); // 19:00 in Bangkok, doors 18:30
    fireEvent.click(screen.getByTestId('join-improve'));
    expect(screen.getByLabelText("I'll come earlier, at 18:30, and prepare there")).toBeTruthy();
  });

  it('branch 2, observers: the same question with 7 minutes and the same two options', () => {
    open();
    fireEvent.click(screen.getByTestId('join-help'));
    expect(screen.getByText('When will you invest 7 minutes to prepare?')).toBeTruthy();
    expect(screen.getByLabelText('At home, before the event')).toBeTruthy();
    expect(screen.getByLabelText("I'll come earlier, at 18:00, and prepare there")).toBeTruthy();
  });

  it('changing the first answer clears the second', () => {
    open();
    fireEvent.click(screen.getByTestId('join-improve'));
    fireEvent.click(screen.getByTestId('prep-event'));
    expect((screen.getByTestId('prep-event') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('join-help'));
    expect((screen.getByTestId('prep-event') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('prep-home') as HTMLInputElement).checked).toBe(false);
  });

  it('the checkbox says the founder-given sentence; Terms and Privacy Policy sit below Continue, linked in a new tab', () => {
    open();
    expect(screen.getByTestId('recording-label').textContent).toBe(
      'To help everyone get the most value, we capture your table conversations with a mic and use Google Gemini to turn them into text for the host and registered attendees in the event chat. After each round, the peer whose business you discussed can use their AI to draft an updated Clarity Canvas inspired by the talk, without quoting you, and share it.',
    );
    expect(screen.getByTestId('recording-label').textContent).toBe(ROUND_UPDATE_CONSENT);
    expect(screen.getByTestId('recording-links').textContent).toBe(ROUND_UPDATE_CONSENT_LINKS);
    const submit = screen.getByTestId('registration-submit');
    expect(submit.compareDocumentPosition(screen.getByTestId('recording-links')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const terms = screen.getByRole('link', { name: 'Terms' });
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(terms.getAttribute('href')).toBe('/terms-of-service');
    expect(privacy.getAttribute('href')).toBe('/privacy-policy');
    for (const a of [terms, privacy]) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('opening a link does not touch the answers or the checkbox', () => {
    open();
    fireEvent.click(screen.getByTestId('join-improve'));
    fireEvent.click(screen.getByRole('link', { name: 'Terms' }));
    expect((screen.getByTestId('join-improve') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('recording-accept').getAttribute('data-state')).toBe('unchecked');
  });

  it('the phone question and Other\'s line', () => {
    open();
    expect(screen.getByText('What phone input do you have?')).toBeTruthy();
    expect(screen.getByLabelText('USB-C')).toBeTruthy();
    expect(screen.getByLabelText('iPhone')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Other'));
    expect(screen.getByTestId('bring-own-mic').textContent).toBe('Please bring a headset or microphone that fits your phone.');
    expect(screen.getByText('How do you expect to gain the most value from the event? (optional)')).toBeTruthy();
  });

  it('no dashes in the form', () => {
    open();
    fireEvent.click(screen.getByTestId('join-improve'));
    expect(screen.getByTestId('registration-questions').textContent).not.toMatch(/[–—]/);
  });
});

describe('P1529 D24 registration form: submitting', () => {
  it('Register is always tappable and names each missing line, in the form\'s order', () => {
    const onSubmit = vi.fn();
    open({ onSubmit });
    const register = screen.getByTestId('registration-submit') as HTMLButtonElement;
    expect(register.disabled).toBe(false);
    fireEvent.click(register);
    expect(screen.getByTestId('registration-missing').textContent).toBe('Choose how you want to join.Accept the recording to register.Choose what phone input you have.');
    fireEvent.click(screen.getByTestId('join-help'));
    fireEvent.click(register);
    expect(screen.getByTestId('registration-missing').textContent).toContain('Choose when you will prepare.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the four missing lines are the four given', () => {
    expect(missingLines(null, null, null, false)).toEqual(['Choose how you want to join.', 'Accept the recording to register.', 'Choose what phone input you have.']);
    expect(missingLines('improve', null, 'usbc', true)).toEqual(['Choose when you will prepare.']);
  });

  it('improving at home sends canvas_before; improving at the event sends canvas_at_doors; neither stores an observer value', () => {
    const onSubmit = vi.fn();
    open({ onSubmit });
    fireEvent.click(screen.getByTestId('join-improve'));
    fireEvent.click(screen.getByTestId('prep-home'));
    fireEvent.click(screen.getByLabelText('USB-C'));
    fireEvent.click(screen.getByTestId('recording-accept'));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith({ participation: 'canvas_before', observerPrep: null, phone: 'usbc', hope: '', recordingAccepted: true });
    fireEvent.click(screen.getByTestId('prep-event'));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith({ participation: 'canvas_at_doors', observerPrep: null, phone: 'usbc', hope: '', recordingAccepted: true });
  });

  it('an observer or mentor stores where they prepare: home or doors', () => {
    const onSubmit = vi.fn();
    open({ onSubmit });
    fireEvent.click(screen.getByTestId('join-help'));
    fireEvent.click(screen.getByTestId('prep-event'));
    fireEvent.click(screen.getByLabelText('Other'));
    fireEvent.click(screen.getByTestId('recording-accept'));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith({ participation: 'observer', observerPrep: 'doors', phone: 'other', hope: '', recordingAccepted: true });
    fireEvent.click(screen.getByTestId('prep-home'));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ participation: 'observer', observerPrep: 'home' }));
  });
});

describe('P1529 D24 registration form: closing', () => {
  it('closing with nothing answered just closes', () => {
    const onCancel = vi.fn();
    open({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('closing after any answer says "You\'re not registered yet." and the answers stay on reopen', () => {
    const onCancel = vi.fn();
    const props = { ...base, onCancel, onSubmit: vi.fn() };
    const { rerender } = render(<RegistrationQuestions open {...props} />);
    fireEvent.click(screen.getByTestId('join-help'));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(screen.getByTestId('registration-missing')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(toastFn).toHaveBeenCalledWith("You're not registered yet.");
    rerender(<RegistrationQuestions open={false} {...props} />);
    rerender(<RegistrationQuestions open {...props} />);
    expect(screen.queryByTestId('registration-missing')).toBeNull();
    expect((screen.getByTestId('join-help') as HTMLInputElement).checked).toBe(true);
  });

  it('a typed hope alone counts as answered', () => {
    open();
    fireEvent.change(screen.getByLabelText('How do you expect to gain the most value from the event? (optional)'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(toastFn).toHaveBeenCalledWith("You're not registered yet.");
  });
});

describe('P1529 D24 registration form: signed out and the waiting list', () => {
  it('signed out the button is Continue, the shortest line below it says sign-in comes next, and the answers are handed over', () => {
    const onSubmit = vi.fn();
    open({ signedIn: false, onSubmit });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull();
    expect(screen.getByTestId('sign-in-line').textContent).toBe('Next, sign in to confirm your place');
    expect(screen.getByTestId('registration-submit').compareDocumentPosition(screen.getByTestId('sign-in-line')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByTestId('join-improve'));
    fireEvent.click(screen.getByTestId('prep-home'));
    fireEvent.click(screen.getByLabelText('USB-C'));
    fireEvent.click(screen.getByTestId('recording-accept'));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('signed in there is no sign-in line', () => {
    open();
    expect(screen.queryByTestId('sign-in-line')).toBeNull();
  });

  it('the waiting list is the same form with its own title and button', () => {
    open({ mode: 'waitlist' });
    expect(screen.getByRole('heading', { name: 'Join the waiting list' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join the waiting list' })).toBeTruthy();
    expect(screen.getByText('In which role would you like to participate?')).toBeTruthy();
  });

  it('answers saved before sign-up fill the form', () => {
    open({ initial: { participation: 'observer', observerPrep: 'doors', phone: 'lightning', hope: 'to learn', recordingAccepted: true } });
    expect((screen.getByTestId('join-help') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('prep-event') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('iPhone') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('How do you expect to gain the most value from the event? (optional)') as HTMLInputElement).value).toBe('to learn');
  });
});

describe('P1529 seats left', () => {
  it('shows "x of y seats left" once 8 or more are registered, and only with a limit', () => {
    const { rerender, container } = render(<PlacesLeftLine left={17} limit={24} />); // 7 registered
    expect(container.textContent).toBe('');
    rerender(<PlacesLeftLine left={16} limit={24} />); // 8 registered
    expect(container.textContent).toBe('16 of 24 seats left');
    rerender(<PlacesLeftLine left={1} limit={24} />);
    expect(container.textContent).toBe('1 of 24 seats left');
    rerender(<PlacesLeftLine left={0} limit={24} />);
    expect(container.textContent).toBe('');
    rerender(<PlacesLeftLine left={null} limit={null} />);
    expect(container.textContent).toBe('');
  });
});
