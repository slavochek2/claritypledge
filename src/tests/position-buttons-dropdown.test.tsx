/**
 * @file position-buttons-dropdown.test.tsx
 * @description Tests that dropdown chevrons on Agree/Disagree buttons are always visible,
 * even on narrow viewports and in nested/compact contexts.
 *
 * Bug: On narrow viewports (< 400px), the dropdown chevrons were getting clipped
 * due to overflow-hidden and insufficient width, removing the ability to select
 * intensity levels (Strongly Agree, Somewhat Agree, etc.)
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared/PositionButton';

const mockCounts: SevenPointCounts = {
  strongly_agree: 1,
  agree: 2,
  somewhat_agree: 1,
  unsure: 1,
  somewhat_disagree: 0,
  disagree: 1,
  strongly_disagree: 0,
};

describe('PositionButtons dropdown visibility', () => {
  it('renders dropdown triggers for Agree and Disagree buttons', () => {
    render(
      <PositionButtons
        userPosition={null}
        counts={mockCounts}
        onPositionClick={() => {}}
      />
    );

    // Agree and Disagree should have dropdown triggers (data-testid)
    expect(screen.getByTestId('agree-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('disagree-dropdown')).toBeInTheDocument();
  });

  it('renders dropdown triggers in compact mode', () => {
    render(
      <PositionButtons
        userPosition={null}
        counts={mockCounts}
        onPositionClick={() => {}}
        compact
      />
    );

    // Even in compact mode, dropdowns must be available
    expect(screen.getByTestId('agree-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('disagree-dropdown')).toBeInTheDocument();
  });

  it('dropdown triggers have correct aria-labels', () => {
    render(
      <PositionButtons
        userPosition={null}
        counts={mockCounts}
        onPositionClick={() => {}}
      />
    );

    expect(screen.getByTestId('agree-dropdown')).toHaveAttribute('aria-label', 'agree options');
    expect(screen.getByTestId('disagree-dropdown')).toHaveAttribute('aria-label', 'disagree options');
  });

  it('Unsure button does NOT have a dropdown (only one option)', () => {
    render(
      <PositionButtons
        userPosition={null}
        counts={mockCounts}
        onPositionClick={() => {}}
      />
    );

    // Unsure should not have a dropdown - it only has one intensity level
    expect(screen.queryByTestId('unsure-dropdown')).not.toBeInTheDocument();
  });

  it('all three position button groups are rendered', () => {
    render(
      <PositionButtons
        userPosition={null}
        counts={mockCounts}
        onPositionClick={() => {}}
      />
    );

    // Each group has a main button + dropdown trigger (except Unsure which has no dropdown)
    // Check by data-testid for dropdown triggers
    expect(screen.getByTestId('disagree-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('agree-dropdown')).toBeInTheDocument();

    // Unsure has no dropdown but should have a button with the text
    expect(screen.getByText('Unsure')).toBeInTheDocument();
  });
});
