import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('P1568: the default Button is the one interactive blue', () => {
  it('renders blue-600 and never the near-black primary token', () => {
    render(<Button>Go</Button>);
    const cls = screen.getByRole('button', { name: 'Go' }).className;
    expect(cls).toContain('bg-blue-600');
    expect(cls).toContain('hover:bg-blue-700');
    expect(cls).not.toContain('bg-primary');
  });

  it('keeps the old near-black look available as variant="dark"', () => {
    render(<Button variant="dark">Dark</Button>);
    const cls = screen.getByRole('button', { name: 'Dark' }).className;
    expect(cls).toContain('bg-primary');
    expect(cls).not.toContain('bg-blue-600');
  });
});
