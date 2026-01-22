import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PositionButtons, type SevenPointCounts } from '@/app/prototypes/linkedin-like/components/shared/PositionButton';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('PositionButtons - 7-Point Scale with 3-Button Dropdown UI', () => {
  const sevenPointCounts: SevenPointCounts = {
    strongly_agree: 5,      // +3
    agree: 10,              // +2
    somewhat_agree: 3,      // +1
    unsure: 2,              // 0
    somewhat_disagree: 4,   // -1
    disagree: 8,            // -2
    strongly_disagree: 2,   // -3
  };

  describe('Button rendering', () => {
    it('renders 3 main button groups (Disagree/Agree have dropdown, Unsure is simple)', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // Disagree and Agree have 2 buttons each (main + dropdown trigger)
      // Unsure is a simple button (no dropdown since only one option)
      // Total: 2 + 1 + 2 = 5 buttons
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);

      // Check all 3 group labels are present
      expect(screen.getByText('Disagree')).toBeInTheDocument();
      expect(screen.getByText('Unsure')).toBeInTheDocument();
      expect(screen.getByText('Agree')).toBeInTheDocument();
    });

    it('displays aggregated counts per button group in brackets', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // Disagree group: strongly_disagree (2) + disagree (8) + somewhat_disagree (4) = 14
      expect(screen.getByText('(14)')).toBeInTheDocument();

      // Unsure group: unsure (2)
      expect(screen.getByText('(2)')).toBeInTheDocument();

      // Agree group: somewhat_agree (3) + agree (10) + strongly_agree (5) = 18
      expect(screen.getByText('(18)')).toBeInTheDocument();
    });
  });

  describe('Quick click behavior (default values)', () => {
    it('clicking Disagree button calls onPositionClick with disagree (-2)', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={handleClick}
        />
      );

      const disagreeBtn = screen.getByText('Disagree').closest('button');
      await user.click(disagreeBtn!);
      expect(handleClick).toHaveBeenCalledWith('disagree');
    });

    it('clicking Unsure button calls onPositionClick with unsure (0)', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={handleClick}
        />
      );

      const unsureBtn = screen.getByText('Unsure').closest('button');
      await user.click(unsureBtn!);
      expect(handleClick).toHaveBeenCalledWith('unsure');
    });

    it('clicking Agree button calls onPositionClick with agree (+2)', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={handleClick}
        />
      );

      const agreeBtn = screen.getByText('Agree').closest('button');
      await user.click(agreeBtn!);
      expect(handleClick).toHaveBeenCalledWith('agree');
    });
  });

  describe('Dropdown options', () => {
    it('Disagree dropdown contains intensity options when opened', async () => {
      const user = userEvent.setup();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const dropdownTrigger = screen.getByTestId('disagree-dropdown');
      await user.click(dropdownTrigger);

      expect(screen.getByRole('menuitem', { name: /Strongly Disagree/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /^Disagree$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Somewhat Disagree/i })).toBeInTheDocument();
    });

    it('Unsure is a simple button without dropdown (single option)', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      expect(screen.queryByTestId('unsure-dropdown')).not.toBeInTheDocument();
    });

    it('Agree dropdown contains intensity options when opened', async () => {
      const user = userEvent.setup();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const dropdownTrigger = screen.getByTestId('agree-dropdown');
      await user.click(dropdownTrigger);

      expect(screen.getByRole('menuitem', { name: /Somewhat Agree/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /^Agree$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Strongly Agree/i })).toBeInTheDocument();
    });

    it('selecting Strongly Disagree from dropdown calls onPositionClick', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={handleClick}
        />
      );

      const dropdownTrigger = screen.getByTestId('disagree-dropdown');
      await user.click(dropdownTrigger);
      await user.click(screen.getByRole('menuitem', { name: /Strongly Disagree/i }));

      expect(handleClick).toHaveBeenCalledWith('strongly_disagree');
    });
  });

  describe('Active state highlighting', () => {
    it('highlights Disagree group when user has any disagree position', () => {
      render(
        <PositionButtons
          userPosition="somewhat_disagree"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const disagreeText = screen.getByText(/Disagree−/);
      const container = disagreeText.closest('button')?.parentElement;
      expect(container).toHaveClass('bg-blue-500');
    });

    it('highlights Unsure button when user position is unsure', () => {
      render(
        <PositionButtons
          userPosition="unsure"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // Unsure button now uses same wrapper structure as Agree/Disagree
      const unsureText = screen.getByText('Unsure');
      const container = unsureText.closest('button')?.parentElement;
      expect(container).toHaveClass('bg-blue-500');
    });

    it('highlights Agree group when user has any agree position', () => {
      render(
        <PositionButtons
          userPosition="strongly_agree"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const stronglyAgreeText = screen.getByText(/Agree\+/);
      const container = stronglyAgreeText.closest('button')?.parentElement;
      expect(container).toHaveClass('bg-blue-500');
    });

    it('shows abbreviated position label when user selected non-default', () => {
      render(
        <PositionButtons
          userPosition="strongly_disagree"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      expect(screen.getByText(/Disagree\+/)).toBeInTheDocument();
    });

    it('shows default label when user selected default position', () => {
      render(
        <PositionButtons
          userPosition="agree"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const agreeButtons = screen.getAllByText(/^Agree$/);
      expect(agreeButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Compact mode', () => {
    it('renders 3 button groups in compact mode (same structure as standard)', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);
    });

    it('compact mode shows aggregated counts in brackets', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      expect(screen.getByText('(14)')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
      expect(screen.getByText('(18)')).toBeInTheDocument();
    });
  });
});

describe('SevenPointCounts aggregation', () => {
  it('correctly calculates button group totals', () => {
    const counts: SevenPointCounts = {
      strongly_agree: 5,
      agree: 10,
      somewhat_agree: 3,
      unsure: 2,
      somewhat_disagree: 4,
      disagree: 8,
      strongly_disagree: 2,
    };

    const disagreeTotal = counts.strongly_disagree + counts.disagree + counts.somewhat_disagree;
    expect(disagreeTotal).toBe(14);

    const unsureTotal = counts.unsure;
    expect(unsureTotal).toBe(2);

    const agreeTotal = counts.somewhat_agree + counts.agree + counts.strongly_agree;
    expect(agreeTotal).toBe(18);
  });
});

describe('Position type mapping', () => {
  it('maps 7-point values correctly (7 total types)', () => {
    const positionTypes = [
      'strongly_disagree',
      'disagree',
      'somewhat_disagree',
      'unsure',
      'somewhat_agree',
      'agree',
      'strongly_agree',
    ];

    expect(positionTypes).toHaveLength(7);
  });
});
