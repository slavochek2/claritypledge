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
    expect(screen.getByText('How do you want to join?')).toBeTruthy();
    expect(screen.getByLabelText('I want to improve my business with honest challenges from peers')).toBeTruthy();
    expect(screen.getByLabelText('I want to help others succeed, as an observer or mentor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Register' })).toBeTruthy();
  });

  it('the second question is absent until the first is answered', () => {
    open();
    expect(screen.queryByTestId('prep-question')).toBeNull();
  });

  it('branch 1, improving a business: its own question and options with {start} and {doors}', () => {
    open();
    fireEvent.click(screen.getByTestId('join-improve'));
    expect(screen.getByText('Where will you prepare and create your Clarity Canvas? It takes about 30 minutes.')).toBeTruthy();
    expect(screen.getByLabelText("At home, before the event. I'll come on time at 18:30.")).toBeTruthy();
    expect(screen.getByLabelText("At the event, with help. I'll come on time at 18:00.")).toBeTruthy();
  });

  it('branch 2, observer or mentor: its own question and options', () => {
    open();
    fireEvent.click(screen.getByTestId('join-help'));
    expect(screen.getByText('Where will you prepare? It takes about 15 minutes to learn how we communicate.')).toBeTruthy();
    expect(screen.getByLabelText("At home, before the event. I'll come on time at 18:30.")).toBeTruthy();
    expect(screen.getByLabelText("At the event. I'll come on time at 18:00.")).toBeTruthy();
    expect(screen.queryByLabelText(/with help/)).toBeNull();
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

  it('the checkbox says the reviewed text, with Terms and Privacy Policy linked in a new tab; the room and /transcribe say the same sentences', () => {
    open();
    expect(screen.getByTestId('recording-label').textContent).toBe(
      'To help every business improve fast, we record your conversations here and Google Gemini turns them into text. The text is posted in the event chat for the host and attendees. After a discussion round, the peer whose business you discussed can use it to improve their Clarity Canvas with AI, and publish it. See our Terms and Privacy Policy.',
    );
    expect(screen.getByTestId('recording-label').textContent).toBe(`${ROUND_UPDATE_CONSENT} ${ROUND_UPDATE_CONSENT_LINKS}`);
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
    expect(screen.getByLabelText('iPhone Lightning')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Other'));
    expect(screen.getByTestId('bring-own-mic').textContent).toBe('Please bring a headset or microphone that fits your phone.');
    expect(screen.getByText('What do you hope to get from this event? (optional)')).toBeTruthy();
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
    expect(screen.getByTestId('registration-missing').textContent).toContain('Choose where you will prepare.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the four missing lines are the four given', () => {
    expect(missingLines(null, null, null, false)).toEqual(['Choose how you want to join.', 'Accept the recording to register.', 'Choose what phone input you have.']);
    expect(missingLines('improve', null, 'usbc', true)).toEqual(['Choose where you will prepare.']);
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
    fireEvent.change(screen.getByLabelText('What do you hope to get from this event? (optional)'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(toastFn).toHaveBeenCalledWith("You're not registered yet.");
  });
});

describe('P1529 D24 registration form: signed out and the waiting list', () => {
  it('signed out the button is Continue, the line above it says sign-in comes next, and the answers are handed over', () => {
    const onSubmit = vi.fn();
    open({ signedIn: false, onSubmit });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull();
    expect(screen.getByTestId('sign-in-line').textContent).toBe("Next, sign in to confirm your place. It isn't confirmed until then.");
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
    expect(screen.getByText('How do you want to join?')).toBeTruthy();
  });

  it('answers saved before sign-up fill the form', () => {
    open({ initial: { participation: 'observer', observerPrep: 'doors', phone: 'lightning', hope: 'to learn', recordingAccepted: true } });
    expect((screen.getByTestId('join-help') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('prep-event') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('iPhone Lightning') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('What do you hope to get from this event? (optional)') as HTMLInputElement).value).toBe('to learn');
  });
});

describe('P1529 places left', () => {
  it('shows places left only at 5 or fewer', () => {
    const { rerender, container } = render(<PlacesLeftLine left={6} />);
    expect(container.textContent).toBe('');
    rerender(<PlacesLeftLine left={5} />);
    expect(container.textContent).toBe('5 places left');
    rerender(<PlacesLeftLine left={1} />);
    expect(container.textContent).toBe('1 place left');
    rerender(<PlacesLeftLine left={0} />);
    expect(container.textContent).toBe('');
  });
});
