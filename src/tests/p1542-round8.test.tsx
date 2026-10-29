/**
 * P1542 round 8 (Codex MED 5): the room's in-place Learn view (LearnInRoom) never mounts the learning flow on an
 * unknown state — loading shows the standard loader, a failed read shows a retry (and no flow), leaving before the
 * state is ready mounts nothing, and once mounted the flow stays mounted (hidden) across tab switches.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LearnInRoom } from '@/app/prototypes/events/components/EventRoomMeet';
import type { PrepState } from '@/app/prototypes/events/prep/use-prep-state';

const state = (over: Partial<PrepState>): PrepState => ({ loading: false, error: false, reload: vi.fn(async () => {}), ...over } as unknown as PrepState);
const flow = () => <div data-testid="flow">flow</div>;

describe('P1542 round 8: LearnInRoom', () => {
  it('loading: the standard loader, never the flow', () => {
    render(<LearnInRoom active state={state({ loading: true })} onMounted={() => {}} render={flow} />);
    expect(screen.getByTestId('room-learn-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('flow')).toBeNull();
  });

  it('a failed read cannot mount the flow; Try again reloads', () => {
    const s = state({ error: true });
    const onMounted = vi.fn();
    render(<LearnInRoom active state={s} onMounted={onMounted} render={flow} />);
    expect(screen.queryByTestId('flow')).toBeNull();
    fireEvent.click(screen.getByTestId('room-learn-retry'));
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(onMounted).not.toHaveBeenCalled();
  });

  it('left before the state was ready: nothing mounts and nothing shows', () => {
    const { container, rerender } = render(<LearnInRoom active state={state({ loading: true })} onMounted={() => {}} render={flow} />);
    rerender(<LearnInRoom active={false} state={state({ loading: true })} onMounted={() => {}} render={flow} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('once ready it mounts, and stays mounted but hidden while another step is shown', () => {
    const onMounted = vi.fn();
    const { rerender } = render(<LearnInRoom active state={state({})} onMounted={onMounted} render={flow} />);
    expect(screen.getByTestId('flow')).toBeInTheDocument();
    expect(onMounted).toHaveBeenCalledTimes(1);
    rerender(<LearnInRoom active={false} state={state({})} onMounted={onMounted} render={flow} />);
    expect(screen.getByTestId('flow')).toBeInTheDocument();
    expect(screen.getByTestId('room-learn')).toHaveClass('hidden');
    // A later failed refresh does not unmount it.
    rerender(<LearnInRoom active state={state({ error: true })} onMounted={onMounted} render={flow} />);
    expect(screen.getByTestId('flow')).toBeInTheDocument();
  });
});
