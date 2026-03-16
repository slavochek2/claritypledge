/**
 * @file p521-position-buttons-progressive.test.tsx
 * @description Unit tests for P521: Position Buttons — Two-Step Progressive Disclosure
 *
 * Tests the redesigned PositionButtons component:
 * - Two-step intensity selection (group click → auto-dropdown)
 * - Unsure selects immediately (single option, no dropdown)
 * - Escape closes dropdown
 * - Count badge visibility (hidden when 0, shown when > 0)
 * - Compact and narrow mode behavior
 * - No truncated labels at any viewport
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('P521: PositionButtons — Progressive Disclosure', () => {
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

  describe('Step 2: Auto-dropdown intensity picker', () => {
    it('shows intensity dropdown when Agree is clicked', async () => {
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

      // Intensity options should appear in dropdown
      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();
      expect(screen.getByText('Strongly Agree')).toBeInTheDocument();
    });

    it('shows intensity dropdown when Disagree is clicked', async () => {
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

      expect(screen.getByText('Somewhat Disagree')).toBeInTheDocument();
      expect(screen.getByText('Strongly Disagree')).toBeInTheDocument();
    });

    it('selects Unsure immediately without intensity dropdown', async () => {
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

      // Should call onPositionClick directly — no intensity dropdown
      expect(handleClick).toHaveBeenCalledWith('unsure');
      // Intensity options should NOT appear
      expect(screen.queryByText('Somewhat Agree')).not.toBeInTheDocument();
      expect(screen.queryByText('Strongly Agree')).not.toBeInTheDocument();
    });

    it('calls onPositionClick with correct intensity when selected from dropdown', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      // Open intensity dropdown for Agree
      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Select "Strongly Agree"
      const stronglyButton = screen.getByText('Strongly Agree');
      await user.click(stronglyButton);

      expect(handleClick).toHaveBeenCalledWith('strongly_agree');
    });

    it('calls onPositionClick with default intensity on group click', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      // Click Disagree — should fire default immediately
      const disagreeButton = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeButton);

      expect(handleClick).toHaveBeenCalledWith('disagree');
    });

    it('calls onPositionClick with "somewhat" intensity from dropdown', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={handleClick}
        />
      );

      // Open intensity dropdown for Agree
      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Select "Somewhat Agree"
      const somewhatButton = screen.getByText('Somewhat Agree');
      await user.click(somewhatButton);

      expect(handleClick).toHaveBeenCalledWith('somewhat_agree');
    });
  });

  describe('Dismiss intensity dropdown', () => {
    it('closes dropdown on Escape key', async () => {
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

      // Dropdown should be open
      expect(screen.getByText('Strongly Agree')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      // Dropdown should close
      expect(screen.queryByText('Strongly Agree')).not.toBeInTheDocument();
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

    it('shows intensity label for strongly_agree', () => {
      render(
        <PositionButtons
          userPosition="strongly_agree"
          counts={mixedCounts}
          onPositionClick={vi.fn()}
        />
      );

      // The Agree segment should show "Agree+" for strongly_agree
      expect(screen.getByText('Agree+')).toBeInTheDocument();
      const agreeSegment = screen.getByText('Agree+').closest('button');
      expect(agreeSegment).toHaveAttribute('aria-pressed', 'true');
    });

    it('opens intensity dropdown when active segment is tapped again', async () => {
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

      // Intensity dropdown should open (to allow changing intensity)
      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();
      expect(screen.getByText('Strongly Agree')).toBeInTheDocument();
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
    it('renders 3 buttons in compact mode', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
    });
  });

  describe('Switching groups', () => {
    it('opens intensity dropdown for new group when user clicks a different group', async () => {
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

      // Intensity dropdown should show for Disagree
      expect(screen.getByText('Somewhat Disagree')).toBeInTheDocument();
      expect(screen.getByText('Strongly Disagree')).toBeInTheDocument();
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
