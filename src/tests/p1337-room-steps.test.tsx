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
    ['ready', 'close', false], // P1542 review: the evening is over, as Back says — readiness is behind it for good
  ])('%s while the evening is at %s → %s', (step, current, open) => {
    expect(canOpenStep(step, current)).toBe(open);
  });
});

describe('RoomSteps', () => {
  it('names five steps, marks the one shown, and greys what is ahead', () => {
    render(<RoomSteps current="table" viewing="table" onSelect={() => {}} />);
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Ready', 'Principle', 'Table', 'Compare', 'Feedback']);
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


describe('RoomSteps — P1542 hike bar (founder 2026-10-23)', () => {
  const hidden: RoomStep[] = ['ready', 'table', 'compare'];
  const labels = { principle: 'Opt in', close: 'Give feedback' };
  it('reads Learn · Opt in · Give feedback; Learn is always open and opens the learning', () => {
    const onOpen = vi.fn();
    render(<RoomSteps current="principle" viewing="principle" onSelect={() => {}} hidden={hidden} labels={labels} learn={{ done: false, onOpen }} />);
    // Visual review round 5 (coordinator): Learn says it is optional in its own label, until it is done.
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Learn (optional)', 'Opt in', 'Give feedback']);
    expect(screen.getByTestId('room-step-learn')).toHaveTextContent('Learn (optional)');
    expect(screen.queryByTestId('room-step-learn-check')).toBeNull();
    fireEvent.click(screen.getByTestId('room-step-learn'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
  it('Learn carries a check once the learning is complete', () => {
    render(<RoomSteps current="close" viewing="principle" onSelect={() => {}} hidden={hidden} labels={labels} learn={{ done: true, onOpen: () => {} }} />);
    expect(screen.getByTestId('room-step-learn-check')).toBeTruthy();
    expect(screen.getByTestId('room-step-learn')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('room-step-close')).toBeEnabled();
    // Round 6b (founder): the label stays "Learn (optional)" on every room view; done adds the tick.
    expect(screen.getByTestId('room-step-learn')).toHaveTextContent('Learn (optional)');
  });
  it('P1542 round 5: inside the learning, Learn is the shown step and no room step is', () => {
    render(<RoomSteps current="principle" viewing={null} onSelect={() => {}} hidden={hidden} labels={labels} learn={{ done: false, active: true, onOpen: () => {} }} />);
    expect(screen.getByTestId('room-step-learn')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('room-step-learn')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('room-step-principle')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('room-step-learn')).toHaveTextContent('Learn (optional)');
  });
  it('P1542 founder (B, 2026-10-29): the short bar is plain tabs — only the shown tab is underlined (thin blue), no bar under the others; ticks stay', () => {
    render(<RoomSteps current="close" viewing="principle" onSelect={() => {}} hidden={hidden} labels={labels} learn={{ done: true, onOpen: () => {} }} done={{ principle: true, close: false }} />);
    const bar = (id: string) => screen.getByTestId(id).querySelector('span[aria-hidden="true"]:last-child')!.getAttribute('class')!;
    expect(bar('room-step-principle')).toMatch(/bg-blue-600/); // shown: underlined
    expect(bar('room-step-principle')).toMatch(/h-0\.5/); // thin, like ordinary app tabs
    for (const id of ['room-step-close', 'room-step-learn']) {
      expect(bar(id)).not.toMatch(/bg-(blue-\d+|muted)/); // no bar under a tab that is not shown, done or not
    }
    expect(screen.getByTestId('room-step-learn-check')).toBeTruthy(); // the done ticks stay
    expect(screen.getByTestId('room-step-principle-check')).toBeTruthy();
  });
  it('round 5c (E): the five-step bar (Clarity Night) keeps a reached step light', () => {
    render(<RoomSteps current="compare" viewing="principle" onSelect={() => {}} />);
    const bar = (id: string) => screen.getByTestId(id).querySelector('span[aria-hidden="true"]:last-child')!.getAttribute('class')!;
    expect(bar('room-step-compare')).toMatch(/bg-blue-300/);
  });
  it('round 5c (I): below 360px "(optional)" stacks under "Learn"', () => {
    render(<RoomSteps current="principle" viewing="principle" onSelect={() => {}} hidden={hidden} labels={labels} learn={{ done: false, onOpen: () => {} }} />);
    expect(screen.getByTestId('room-step-learn-optional').parentElement!.getAttribute('class')).toMatch(/max-\[359px\]:flex-col/);
  });
  it('VQA round 4 (7): a done step carries its check at every width on the short bar; the five-step bar still hides it below 430px', () => {
    const { unmount } = render(<RoomSteps current="close" viewing="close" onSelect={() => {}} hidden={hidden} labels={labels} />);
    expect(screen.getByTestId('room-step-principle-check').getAttribute('class')).not.toMatch(/\bhidden\b/);
    unmount();
    render(<RoomSteps current="close" viewing="close" onSelect={() => {}} />);
    expect(screen.getByTestId('room-step-principle-check').getAttribute('class')).toMatch(/\bhidden\b/);
  });
});
