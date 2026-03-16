/**
 * @file p521-position-buttons-progressive.test.tsx
 * @description Unit tests for P521: Position Buttons — Two-Step Progressive Disclosure
 *
 * Tests the redesigned PositionButtons component:
 * - Two-step intensity selection (group → intensity picker)
 * - Unsure selects immediately (single option, no picker)
 * - Cancel/back from intensity picker
 * - Count badge visibility (hidden when 0, shown when > 0)
 * - Compact and narrow mode behavior
 * - No truncated labels at any viewport
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared/PositionButton';

const zeroCounts: SevenPointCounts = {
  strongly_agree: 0,
  agree: 0,
  somewhat_agree: 0,
  unsure: 0,
  somewhat_disagree: 0,
  disagree: 0,
  strongly_disagree: 0,
};

const mixedCounts: SevenPointCounts = {
  strongly_agree: 2,
  agree: 5,
  somewhat_agree: 1,
  unsure: 3,
  somewhat_disagree: 1,
  disagree: 4,
  strongly_disagree: 2,
};

describe.skip('P521: PositionButtons — Progressive Disclosure', () => {
  describe('Step 1: Group selection (default state)', () => {
    it('renders three group buttons: Disagree, Unsure, Agree', () => {
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      expect(screen.getByText('Disagree')).toBeInTheDocument();
      expect(screen.getByText('Unsure')).toBeInTheDocument();
      expect(screen.getByText('Agree')).toBeInTheDocument();
    });

    it('does not show dropdown chevrons', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={vi.fn()}
        />
      );

      // No dropdown triggers should be present
      expect(screen.queryByTestId('disagree-dropdown')).not.toBeInTheDocument();
      expect(screen.queryByTestId('agree-dropdown')).not.toBeInTheDocument();
    });

    it('does not show truncated labels like "Dis..." or "Ag"', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={vi.fn()}
        />
      );

      // No truncated text should be rendered (even if hidden by CSS)
      expect(screen.queryByText('Dis...')).not.toBeInTheDocument();
      expect(screen.queryByText('Ag')).not.toBeInTheDocument();
      expect(screen.queryByText('Di')).not.toBeInTheDocument();
      expect(screen.queryByText('Agr...')).not.toBeInTheDocument();
    });
  });

  describe('Step 2: Intensity picker', () => {
    it('shows intensity picker when Agree is clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Intensity picker should appear with three options
      expect(screen.getByText('Somewhat')).toBeInTheDocument();
      expect(screen.getByText('Strongly')).toBeInTheDocument();
      // The group name should also appear as the default intensity option
    });

    it('shows intensity picker when Disagree is clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      const disagreeButton = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeButton);

      expect(screen.getByText('Somewhat')).toBeInTheDocument();
      expect(screen.getByText('Strongly')).toBeInTheDocument();
    });

    it('selects Unsure immediately without intensity picker', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      const unsureButton = screen.getByText('Unsure').closest('button')!;
      await user.click(unsureButton);

      // Should call onPositionClick directly — no intensity picker
      expect(handleClick).toHaveBeenCalledWith('unsure');
      // Intensity picker should NOT appear
      expect(screen.queryByText('Somewhat')).not.toBeInTheDocument();
      expect(screen.queryByText('Strongly')).not.toBeInTheDocument();
    });

    it('calls onPositionClick with correct intensity when selected', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      // Open intensity picker for Agree
      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Select "Strongly"
      const stronglyButton = screen.getByText('Strongly').closest('button')!;
      await user.click(stronglyButton);

      expect(handleClick).toHaveBeenCalledWith('strongly_agree');
    });

    it('calls onPositionClick with default intensity for middle option', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      // Open intensity picker for Disagree
      const disagreeButton = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeButton);

      // Select the default (middle) option — "Disagree"
      const defaultButton = screen.getByText('Disagree').closest('button')!;
      await user.click(defaultButton);

      expect(handleClick).toHaveBeenCalledWith('disagree');
    });

    it('calls onPositionClick with "somewhat" intensity', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      // Open intensity picker for Agree
      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Select "Somewhat"
      const somewhatButton = screen.getByText('Somewhat').closest('button')!;
      await user.click(somewhatButton);

      expect(handleClick).toHaveBeenCalledWith('somewhat_agree');
    });
  });

  describe('Cancel intensity selection', () => {
    it('shows "← Back" link when intensity picker is open', async () => {
      const user = userEvent.setup();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={vi.fn()}
        />
      );

      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Back link should be visible
      const backLink = screen.getByLabelText('Cancel position selection');
      expect(backLink).toBeInTheDocument();
    });

    it('returns to group view when "← Back" is clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      // Open intensity picker
      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Click back
      const backLink = screen.getByLabelText('Cancel position selection');
      await user.click(backLink);

      // Should be back to group view
      expect(screen.getByText('Disagree')).toBeInTheDocument();
      expect(screen.getByText('Unsure')).toBeInTheDocument();
      expect(screen.getByText('Agree')).toBeInTheDocument();
      // No onPositionClick should have been called
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Confirmed state (position selected)', () => {
    it('highlights active group segment with aria-pressed', () => {
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={vi.fn()}
        />
      );

      const agreeSegment = screen.getByText('Agree').closest('button');
      expect(agreeSegment).toHaveAttribute('aria-pressed', 'true');

      const disagreeSegment = screen.getByText('Disagree').closest('button');
      expect(disagreeSegment).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows active group with icon', () => {
      render(
        <PositionButtons
          userPosition="strongly_agree"
          counts={mixedCounts}
          onPositionClick={vi.fn()}
        />
      );

      // The Agree segment should be active (strongly_agree belongs to agree group)
      const agreeSegment = screen.getByText('Agree').closest('button');
      expect(agreeSegment).toHaveAttribute('aria-pressed', 'true');
    });

    it('opens intensity picker when active segment is tapped again', async () => {
      const user = userEvent.setup();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={vi.fn()}
        />
      );

      // Click the already-selected Agree
      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Intensity picker should open (to allow changing intensity)
      expect(screen.getByText('Somewhat')).toBeInTheDocument();
      expect(screen.getByText('Strongly')).toBeInTheDocument();
    });
  });

  describe('Count badges', () => {
    it('shows count badge when count > 0', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={mixedCounts}
          onPositionClick={vi.fn()}
        />
      );

      // Agree group total: 2 + 5 + 1 = 8
      expect(screen.getByText('8')).toBeInTheDocument();
      // Disagree group total: 2 + 4 + 1 = 7
      expect(screen.getByText('7')).toBeInTheDocument();
      // Unsure: 3
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('does not show count badge when count is 0', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={vi.fn()}
        />
      );

      // No "(0)" text should be visible
      expect(screen.queryByText('(0)')).not.toBeInTheDocument();
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('hides badges in compact mode', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={mixedCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      // Count badges should be hidden in compact mode
      expect(screen.queryByText('8')).not.toBeInTheDocument();
      expect(screen.queryByText('7')).not.toBeInTheDocument();
    });
  });

  describe('Compact mode', () => {
    it('does not show helper text in compact mode intensity picker', async () => {
      const user = userEvent.setup();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Helper text "How strongly do you agree?" should NOT be present in compact
      expect(screen.queryByText(/how strongly/i)).not.toBeInTheDocument();
    });

    it('still shows "← Back" in compact mode', async () => {
      const user = userEvent.setup();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      expect(screen.getByLabelText('Cancel position selection')).toBeInTheDocument();
    });
  });

  describe('Switching groups', () => {
    it('opens intensity picker for new group when user clicks a different group', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={handleClick}
        />
      );

      // User currently agrees, clicks Disagree
      const disagreeButton = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeButton);

      // Intensity picker should show for Disagree
      expect(screen.getByText('Somewhat')).toBeInTheDocument();
      expect(screen.getByText('Strongly')).toBeInTheDocument();
    });
  });

  describe('API compatibility', () => {
    it('accepts compact prop without error', () => {
      expect(() => {
        render(
          <PositionButtons
            userPosition={null}
            counts={zeroCounts}
            onPositionClick={vi.fn()}
            compact
          />
        );
      }).not.toThrow();
    });

    it('accepts narrow prop without error', () => {
      expect(() => {
        render(
          <PositionButtons
            userPosition={null}
            counts={zeroCounts}
            onPositionClick={vi.fn()}
            narrow
          />
        );
      }).not.toThrow();
    });

    it('accepts all 7 position types as userPosition', () => {
      const positions = [
        'strongly_disagree', 'disagree', 'somewhat_disagree',
        'unsure',
        'somewhat_agree', 'agree', 'strongly_agree',
      ] as const;

      for (const pos of positions) {
        expect(() => {
          const { unmount } = render(
            <PositionButtons
              userPosition={pos}
              counts={mixedCounts}
              onPositionClick={vi.fn()}
            />
          );
          unmount();
        }).not.toThrow();
      }
    });
  });
});
