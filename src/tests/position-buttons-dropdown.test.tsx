/**
 * @file position-buttons-dropdown.test.tsx
 * @description Tests for intensity dropdown behavior on position buttons.
 *
 * Updated for P847: Auto-dropdown on first click is gone. Menu opens only when
 * the user clicks the already-selected segment (refine path). First click on an
 * unselected group selects the default intensity with no menu.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('clicking selected Agree opens intensity menu (P847 refine path)', async () => {
    const user = userEvent.setup();
    render(
      <PositionButtons
        userPosition="agree"
        counts={mockCounts}
        onPositionClick={() => {}}
      />
    );

    // P847: menu opens only when the user clicks the already-selected segment
    const agreeButton = screen.getByText('Agree').closest('button')!;
    await user.click(agreeButton);

    expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();
    expect(screen.getByText('Strongly Agree')).toBeInTheDocument();
  });

  it('clicking selected Disagree opens intensity menu (P847 refine path)', async () => {
    const user = userEvent.setup();
    render(
      <PositionButtons
        userPosition="disagree"
        counts={mockCounts}
        onPositionClick={() => {}}
      />
    );

    const disagreeButton = screen.getByText('Disagree').closest('button')!;
    await user.click(disagreeButton);

    expect(screen.getByText('Somewhat Disagree')).toBeInTheDocument();
    expect(screen.getByText('Strongly Disagree')).toBeInTheDocument();
  });

  it('no dropdown chevrons are present (removed in P521)', () => {
    render(
      <PositionButtons
        userPosition={null}
        counts={mockCounts}
        onPositionClick={() => {}}
      />
    );

    // Old chevron dropdown triggers should NOT exist
    expect(screen.queryByTestId('agree-dropdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('disagree-dropdown')).not.toBeInTheDocument();
  });

  it('Unsure button does NOT have a dropdown (only one option)', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <PositionButtons
        userPosition={null}
        counts={mockCounts}
        onPositionClick={handleClick}
      />
    );

    const unsureButton = screen.getByText('Unsure').closest('button')!;
    await user.click(unsureButton);

    // Unsure selects immediately, no dropdown
    expect(handleClick).toHaveBeenCalledWith('unsure');
    expect(screen.queryByText('Somewhat')).not.toBeInTheDocument();
  });

  it('all three position button groups are rendered', () => {
    render(
      <PositionButtons
        userPosition={null}
        counts={mockCounts}
        onPositionClick={() => {}}
      />
    );

    expect(screen.getByText('Disagree')).toBeInTheDocument();
    expect(screen.getByText('Unsure')).toBeInTheDocument();
    expect(screen.getByText('Agree')).toBeInTheDocument();
  });
});
