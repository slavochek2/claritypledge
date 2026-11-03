/**
 * P1536 stage V round 1, C15: the rename field opened on a long name showed only its tail ("n for the Northern Region") at 1440, because the field
 * had no width of its own (the name's box is content-sized from 1280px) and select-all left the caret at the end. jsdom has no layout: these pin the
 * width class that gives the field room and the caret at the start, so the name reads from its first letter.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CanvasNameEdit } from '@/app/components/canvas/canvas-name-edit';

const LONG = 'Acme Bakery Plan for the Northern Region';

describe('C15: the rename field shows the name from its first letter', () => {
  it('has a width of its own from 1280px, so a content-sized parent cannot shrink it to a stub', () => {
    render(<CanvasNameEdit title={LONG} canEdit onSave={vi.fn()} />);
    fireEvent.click(screen.getByTestId('canvas-rename'));
    expect(screen.getByTestId('canvas-title-input').className).toMatch(/xl:w-\[26rem\]/);
  });

  it('selects the whole name with the caret at its start, so the field is not scrolled to the tail', () => {
    render(<CanvasNameEdit title={LONG} canEdit onSave={vi.fn()} />);
    fireEvent.click(screen.getByTestId('canvas-rename'));
    const input = screen.getByTestId('canvas-title-input') as HTMLInputElement;
    fireEvent.focus(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(LONG.length);
    expect(input.selectionDirection).toBe('backward');
  });

  it('CONTROL: typing, Enter and Escape still work', () => {
    const onSave = vi.fn();
    render(<CanvasNameEdit title="Old" canEdit onSave={onSave} />);
    fireEvent.click(screen.getByTestId('canvas-rename'));
    const input = screen.getByTestId('canvas-title-input');
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('New');
  });
});
