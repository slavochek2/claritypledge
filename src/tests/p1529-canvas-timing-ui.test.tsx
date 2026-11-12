/** P1529 E1/E4: the host's setting field and the confirm page's required-preparation words. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasTimingField } from '@/app/prototypes/events/components/CanvasTimingField';
import { PrepBlock } from '@/app/prototypes/events/prep/PrepPieces';

describe('CanvasTimingField', () => {
  it('shows the current choice and reports a change', () => {
    const onChange = vi.fn();
    render(<CanvasTimingField value="at_event" onChange={onChange} />);
    expect((screen.getByTestId('canvas-timing-at_event') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('canvas-timing-before'));
    expect(onChange).toHaveBeenCalledWith('before');
  });
});

describe('PrepBlock required (sales mastermind, canvas at the event)', () => {
  const props = { progress: { done: 0, total: 4, complete: false }, minutes: 15, reminded: false, proof: { line: null, people: [] }, onPrepare: () => undefined, onRemind: () => undefined };
  it('says preparation is required and never asks "do you have 10 minutes"', () => {
    render(<PrepBlock {...props} required />);
    expect(screen.getByTestId('prep-question').textContent).toBe('Do your 15-minute preparation');
    expect(screen.getByTestId('prep-why').textContent).toContain('15 minutes early at the venue');
    expect(screen.getByTestId('prep-why').textContent).toContain('Clarity Canvas together at the event');
    expect(document.body.textContent).not.toContain('Do you have');
  });
  it('required: no remind-me-later opt-out', () => {
    render(<PrepBlock {...props} required />);
    expect(screen.queryByText('Remind me by email')).toBeNull();
    expect(screen.getByText('Prepare now')).toBeTruthy();
  });
  it('other events keep the question', () => {
    render(<PrepBlock {...props} minutes={10} />);
    expect(screen.getByText('Remind me by email')).toBeTruthy();
    expect(screen.getByTestId('prep-question').textContent).toBe('Do you have 10 minutes to prepare for the event?');
  });
});
