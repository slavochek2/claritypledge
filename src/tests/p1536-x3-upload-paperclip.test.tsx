/**
 * @file p1536-x3-upload-paperclip.test.tsx
 * @description P1536 3c X3 (S3c.3): in a canvas thread "+ Upload" becomes an icon button opening the file picker (P1618 amends X3: the Upload icon, not the paperclip;
 * p1618-canvas-upload-icon.test.tsx). No plus anywhere in that spot, and D15's status (the update is running) stays in the same spot.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadSpot } from '@/app/pages/chat/CanvasUploadButton';

afterEach(cleanup);

describe('S3c.3 (X3): a canvas thread\'s upload is one icon', () => {
  it('is an Upload icon button named Upload: no "+", no visible word, in the secondary blue outline (P1621 round 2, founder: as Undo)', () => {
    render(<UploadSpot waiting={false} busy={false} onPick={vi.fn()} />);
    const button = screen.getByTestId('canvas-upload');
    expect(button).toHaveAccessibleName('Upload');
    expect(button.querySelector('svg.lucide-upload')).not.toBeNull();
    expect(button.querySelector('svg.lucide-plus')).toBeNull();
    expect(button.textContent).toBe('');
    expect(button.className).toMatch(/border-blue-600/);
  });

  it('opens the file picker, and the picked file is handed over', () => {
    const onPick = vi.fn();
    render(<UploadSpot waiting={false} busy={false} onPick={onPick} />);
    const input = screen.getByTestId('canvas-upload-input') as HTMLInputElement;
    const open = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByTestId('canvas-upload'));
    expect(open).toHaveBeenCalledTimes(1);
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });

  it('D15: while an update runs the same spot is a status, not a disabled button, and it carries no plus either', () => {
    render(<UploadSpot waiting busy={false} onPick={vi.fn()} />);
    const status = screen.getByTestId('canvas-upload-waits');
    expect(status).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('canvas-upload')).toBeNull();
    expect(status.querySelector('svg.lucide-plus')).toBeNull();
    expect(status.querySelector('svg.lucide-upload')).not.toBeNull();
  });
});
