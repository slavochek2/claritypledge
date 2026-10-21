/**
 * @file p1515-confirm-dialog-card.test.tsx
 * @description P1515 phase 4 review: the confirmation reads as a card on a phone (rounded, side margins,
 * shadow) with both buttons at least 44px tall, not a flat full-bleed white band.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';

afterEach(() => cleanup());

describe('ConfirmDialog as a card', () => {
  it('is a rounded card with side margins and a shadow, and both buttons are 44px targets', () => {
    render(<ConfirmDialog open onOpenChange={() => undefined} title="Sure?" description="Really" confirmLabel="Yes" onConfirm={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/\brounded-xl\b/);
    expect(dialog.className).toMatch(/w-\[calc\(100%-2rem\)\]/);
    expect(dialog.className).toMatch(/shadow-xl/);
    expect(dialog.className).toMatch(/sm:rounded-xl/); // the base sm:rounded-lg would otherwise win on desktop
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toMatch(/min-h-11/);
    expect(screen.getByRole('button', { name: 'Yes' }).className).toMatch(/min-h-11/);
  });
});
