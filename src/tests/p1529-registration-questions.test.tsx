import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RegistrationQuestions, PlacesLeftLine } from '@/app/prototypes/events/components/RegistrationQuestions';
import { formatDoorsTime } from '@/app/prototypes/events/event-doors';

const open = (onSubmit = vi.fn()) => render(
  <RegistrationQuestions open datetime="2026-11-14T11:30:00+00:00" timezone="Asia/Bangkok" busy={false} onCancel={vi.fn()} onSubmit={onSubmit} />,
);

describe('P1529 registration step', () => {
  it('names the doors time in the event zone', () => {
    expect(formatDoorsTime('2026-11-14T11:30:00+00:00', 'Asia/Bangkok')).toBe('18:00');
    open();
    expect(screen.getByText(/30 minutes earlier, at 18:00/)).toBeTruthy();
  });

  it('Register is always tappable, names what is missing, and submits nothing until all required are answered', () => {
    const onSubmit = vi.fn();
    open(onSubmit);
    const register = screen.getByTestId('registration-submit') as HTMLButtonElement;
    expect(register.disabled).toBe(false);
    fireEvent.click(register);
    expect(screen.getByTestId('registration-missing').textContent).toMatch(/take part/);
    fireEvent.click(screen.getByLabelText(/Observe/));
    fireEvent.click(register);
    expect(screen.getByTestId('registration-missing').textContent).toMatch(/phone/);
    fireEvent.click(screen.getByLabelText('Other'));
    expect(screen.getByTestId('bring-own-mic')).toBeTruthy();
    fireEvent.click(register);
    expect(screen.getByTestId('registration-missing').textContent).toMatch(/transcription/);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('recording-accept'));
    fireEvent.click(register);
    expect(onSubmit).toHaveBeenCalledWith({ participation: 'observer', phone: 'other', hope: '', recordingAccepted: true });
  });

  it('reopened after a cancel, the missing line is gone but the answers given are kept', () => {
    const props = { datetime: '2026-11-14T11:30:00+00:00', timezone: 'Asia/Bangkok', busy: false, onCancel: vi.fn(), onSubmit: vi.fn() };
    const { rerender } = render(<RegistrationQuestions open {...props} />);
    fireEvent.click(screen.getByLabelText(/Observe/));
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(screen.getByTestId('registration-missing').textContent).toMatch(/phone/);
    rerender(<RegistrationQuestions open={false} {...props} />);
    rerender(<RegistrationQuestions open {...props} />);
    expect(screen.queryByTestId('registration-missing')).toBeNull();
    expect((screen.getByLabelText(/Observe/) as HTMLInputElement).checked).toBe(true);
  });

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
