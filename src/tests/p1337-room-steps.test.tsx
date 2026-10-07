// @vitest-environment jsdom
/**
 * P1337 founder walkthrough 7 — the step bar: Ready · Principle · Table · Compare · Close.
 * Steps behind you open, steps ahead do not; Close only once the evening has ended.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RoomSteps, canOpenStep, type RoomStep } from '@/app/prototypes/events/rounds/RoomSteps';

describe('canOpenStep', () => {
  it.each<[RoomStep, RoomStep, boolean]>([
    ['ready', 'principle', true],
    ['principle', 'compare', true],
    ['table', 'compare', true],
    ['compare', 'table', false], // ahead of you
    ['table', 'principle', false],
    ['close', 'compare', false], // greyed until the evening ends
    ['close', 'close', true],
    ['principle', 'close', true],
    ['table', 'close', false], // no table to go back to once the evening closed
    ['compare', 'close', false],
  ])('%s while the evening is at %s → %s', (step, current, open) => {
    expect(canOpenStep(step, current)).toBe(open);
  });
});

describe('RoomSteps', () => {
  it('names five steps, marks the one shown, and greys what is ahead', () => {
    render(<RoomSteps current="table" viewing="table" onSelect={() => {}} />);
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Ready', 'Principle', 'Table', 'Compare', 'Close']);
    expect(screen.getByTestId('room-step-table')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('room-step-compare')).toBeDisabled();
    expect(screen.getByTestId('room-step-close')).toBeDisabled();
    expect(screen.getByTestId('room-step-principle')).toBeEnabled();
  });

  it('a tap on a step behind you asks for it', () => {
    const onSelect = vi.fn();
    render(<RoomSteps current="compare" viewing="compare" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('room-step-table'));
    expect(onSelect).toHaveBeenCalledWith('table');
  });

  // P1430: done · current · ahead, and steps that cannot open say so.
  it('done steps are marked done, the shown step is current, steps ahead are disabled for assistive tech too', () => {
    render(<RoomSteps current="compare" viewing="compare" onSelect={() => {}} />);
    expect(screen.getByTestId('room-step-ready')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('room-step-ready')).toHaveAccessibleName('Ready, done');
    expect(screen.getByTestId('room-step-table')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('room-step-compare')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('room-step-compare')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('room-step-close')).toHaveAttribute('data-state', 'ahead');
    expect(screen.getByTestId('room-step-close')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('room-step-table')).not.toHaveAttribute('aria-disabled');
  });

  it('looking back at a done step makes it the bold one; where the evening is stays reached', () => {
    render(<RoomSteps current="compare" viewing="table" onSelect={() => {}} />);
    expect(screen.getByTestId('room-step-table')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('room-step-compare')).toHaveAttribute('data-state', 'reached');
  });
});

