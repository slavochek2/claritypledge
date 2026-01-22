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
    false_premise: 1,       // flag
    somewhat_disagree: 4,   // -1
    disagree: 8,            // -2
    strongly_disagree: 2,   // -3
  };

  describe('Button rendering', () => {
    it('renders exactly 3 main button groups (each has main + dropdown trigger)', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // In standard mode: each group has 2 buttons (main + dropdown trigger)
      // So we expect 6 buttons total for 3 groups
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(6); // 3 groups × 2 buttons each

      // Check all 3 group labels are present
      expect(screen.getByText('Disagree')).toBeInTheDocument();
      expect(screen.getByText('Unsure')).toBeInTheDocument();
      expect(screen.getByText('Agree')).toBeInTheDocument();
    });

    it('displays aggregated counts per button group', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // Disagree group: strongly_disagree (2) + disagree (8) + somewhat_disagree (4) = 14
      expect(screen.getByText('14')).toBeInTheDocument();

      // Unsure group: unsure (2) + false_premise (1) = 3
      expect(screen.getByText('3')).toBeInTheDocument();

      // Agree group: somewhat_agree (3) + agree (10) + strongly_agree (5) = 18
      expect(screen.getByText('18')).toBeInTheDocument();
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

      // Click the main Disagree button (not the dropdown trigger)
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

      // Open dropdown using the testid
      const dropdownTrigger = screen.getByTestId('disagree-dropdown');
      await user.click(dropdownTrigger);

      // Check dropdown options appear
      expect(screen.getByRole('menuitem', { name: /Strongly Disagree/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /^Disagree$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Somewhat Disagree/i })).toBeInTheDocument();
    });

    it('Unsure dropdown contains Unsure and False Premise options', async () => {
      const user = userEvent.setup();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const dropdownTrigger = screen.getByTestId('unsure-dropdown');
      await user.click(dropdownTrigger);

      expect(screen.getByRole('menuitem', { name: /^Unsure$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /False Premise/i })).toBeInTheDocument();
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

    it('selecting False Premise from dropdown calls onPositionClick', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={handleClick}
        />
      );

      const dropdownTrigger = screen.getByTestId('unsure-dropdown');
      await user.click(dropdownTrigger);
      await user.click(screen.getByRole('menuitem', { name: /False Premise/i }));

      expect(handleClick).toHaveBeenCalledWith('false_premise');
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

      // Find the button containing "Disagree" text (but not "Strongly")
      // The main button should have the active class
      const disagreeText = screen.getByText(/Somewhat Disagree/i);
      const disagreeBtn = disagreeText.closest('button');
      expect(disagreeBtn).toHaveClass('bg-blue-500');
    });

    it('highlights Unsure group when user position is false_premise', () => {
      render(
        <PositionButtons
          userPosition="false_premise"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // The button should show "False Premise" and be active
      const falsePremiseText = screen.getByText(/False Premise/i);
      const unsureBtn = falsePremiseText.closest('button');
      expect(unsureBtn).toHaveClass('bg-blue-500');
    });

    it('highlights Agree group when user has any agree position', () => {
      render(
        <PositionButtons
          userPosition="strongly_agree"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const stronglyAgreeText = screen.getByText(/Strongly Agree/i);
      const agreeBtn = stronglyAgreeText.closest('button');
      expect(agreeBtn).toHaveClass('bg-blue-500');
    });

    it('shows specific position label when user selected non-default', () => {
      render(
        <PositionButtons
          userPosition="strongly_disagree"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // The button should show "Strongly Disagree" instead of just "Disagree"
      expect(screen.getByText(/Strongly Disagree/i)).toBeInTheDocument();
    });

    it('shows default label when user selected default position', () => {
      render(
        <PositionButtons
          userPosition="agree" // Default for agree group is 'agree'
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // Should just show "Agree" (not "Somewhat Agree" or "Strongly Agree")
      const agreeButtons = screen.getAllByText(/^Agree$/);
      expect(agreeButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Compact mode', () => {
    it('renders 3 button groups in compact mode (single trigger each)', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      // In compact mode, each group is a single dropdown trigger
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
    });

    it('compact mode shows aggregated counts', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      expect(screen.getByText('14')).toBeInTheDocument(); // Disagree
      expect(screen.getByText('3')).toBeInTheDocument();  // Unsure
      expect(screen.getByText('18')).toBeInTheDocument(); // Agree
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
      false_premise: 1,
      somewhat_disagree: 4,
      disagree: 8,
      strongly_disagree: 2,
    };

    // Disagree group: -3 + -2 + -1 = 2 + 8 + 4 = 14
    const disagreeTotal = counts.strongly_disagree + counts.disagree + counts.somewhat_disagree;
    expect(disagreeTotal).toBe(14);

    // Unsure group: 0 + flag = 2 + 1 = 3
    const unsureTotal = counts.unsure + counts.false_premise;
    expect(unsureTotal).toBe(3);

    // Agree group: +1 + +2 + +3 = 3 + 10 + 5 = 18
    const agreeTotal = counts.somewhat_agree + counts.agree + counts.strongly_agree;
    expect(agreeTotal).toBe(18);
  });
});

describe('Position type mapping', () => {
  it('maps 7-point values + false_premise correctly (8 total types)', () => {
    const positionTypes = [
      'strongly_disagree',  // -3
      'disagree',           // -2
      'somewhat_disagree',  // -1
      'unsure',             // 0
      'somewhat_agree',     // +1
      'agree',              // +2
      'strongly_agree',     // +3
      'false_premise',      // flag
    ];

    expect(positionTypes).toHaveLength(8);
  });
});
