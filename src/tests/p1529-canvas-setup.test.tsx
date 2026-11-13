/**
 * P1529 E5: the "Make your Clarity Canvas" part: the phone card per role, and the room's Canvas tab.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  role: null as null | 'loading' | 'failed' | { participation: string | null; observerPrep: string | null },
  roleRetry: vi.fn(),
  stepShared: false,
  startRun: vi.fn(),
}));

vi.mock('@/app/prototypes/events/use-my-arrival', () => ({
  useMyRegistrationArrivalRead: () => ({ arrival: h.role === 'loading' ? undefined : typeof h.role === 'object' && h.role?.participation ? { owner: h.role.participation !== 'observer', atDoors: true } : null, failed: h.role === 'failed', retry: h.roleRetry }),
}));
vi.mock('@/app/prototypes/events/prep/use-event-canvas-step', () => ({
  useEventCanvasStep: () => ({
    loaded: true, readFailed: false, retry: vi.fn(), busy: false, published: [], selected: null, setPicked: vi.fn(), dialog: null,
    view: h.stepShared
      ? { state: 'E', title: 'shared', body: '', primary: null, secondary: null }
      : { state: 'A', title: 'Create', body: '', primary: { id: 'create', label: 'Create your canvas', run: h.startRun }, secondary: null },
  }),
}));

import { CanvasSetupPhoneCard } from '@/app/prototypes/events/rounds/CanvasSetupParts';
import { RoomSteps } from '@/app/prototypes/events/rounds/RoomSteps';
import { hiddenRoomSteps } from '@/app/prototypes/events/rounds/hidden-room-steps';
import { canvasTimingOf } from '@/app/types/event-fields';

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('pure rules', () => {
  it('the canvas is at the event unless the event says before', () => {
    expect(canvasTimingOf(undefined)).toBe('at_event');
    expect(canvasTimingOf('before')).toBe('before');
  });
});

describe('the phone card per role', () => {
  const run = (participation: string | null, shared = false) => {
    h.role = participation === 'loading' || participation === 'failed' ? participation : { participation, observerPrep: null };
    h.stepShared = shared;
    return render(<CanvasSetupPhoneCard eventId="ev-1" event={{ id: 'ev-1', flow: 'sales-mastermind' }} self={{ id: 'm', profileId: 'p-a' } as never} />);
  };
  it('an owner: one primary, Open your mirror agent', () => {
    run('canvas_at_doors');
    expect(screen.getByTestId('canvas-setup-primary').textContent).toBe('Open your mirror agent');
    fireEvent.click(screen.getByTestId('canvas-setup-primary'));
    expect(h.startRun).toHaveBeenCalled();
  });
  it('shared: the sentence, no button', () => {
    run('canvas_at_doors', true);
    expect(screen.getByTestId('canvas-setup-shared').textContent).toBe('Your Clarity Canvas is shared with this event \u2713');
    expect(screen.queryByTestId('canvas-setup-primary')).toBeNull();
  });
  it('role still loading: the title and a quiet line, no button', () => {
    run('loading');
    expect(screen.getByTestId('canvas-setup-loading')).toBeTruthy();
    expect(screen.queryByTestId('canvas-setup-primary')).toBeNull();
  });
  it('role unreadable: the neutral card with the button and a Retry, never an observer or owner-specific line', () => {
    run('failed');
    expect(screen.getByTestId('canvas-setup-primary')).toBeTruthy();
    fireEvent.click(screen.getByTestId('canvas-setup-role-retry'));
    expect(h.roleRetry).toHaveBeenCalled();
    expect(screen.queryByTestId('canvas-setup-observer')).toBeNull();
  });
  it('an observer: the help line and no button', () => {
    run('observer');
    expect(screen.getByTestId('canvas-setup-observer').textContent).toBe('Help the people next to you make their canvas');
    expect(screen.queryByTestId('canvas-setup-primary')).toBeNull();
  });
});

describe('the room step bar', () => {
  const bar = (withCanvas: boolean, current: 'principle' | 'canvas' | 'table', done?: boolean) => render(
    <RoomSteps current={current} viewing={current} onSelect={() => {}} hidden={['compare']} withCanvas={withCanvas} canvasDone={withCanvas ? done : undefined} />,
  );
  it('Canvas sits between Principle and Table, only when asked for', () => {
    const { unmount } = bar(true, 'canvas');
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Ready', 'Principle', 'Canvas', 'Table', 'Feedback']);
    unmount();
    bar(false, 'principle');
    expect(screen.queryByTestId('room-step-canvas')).toBeNull();
  });
  it('a shared canvas ticks the step; the hidden-steps rule is unchanged', () => {
    bar(true, 'table', true);
    expect(screen.getByTestId('room-step-canvas').getAttribute('data-state')).toBe('done');
    expect(hiddenRoomSteps({ mastermind: true, room: { readiness: false, rounds: true } } as never).sort()).toEqual(['compare', 'ready']);
  });
});
