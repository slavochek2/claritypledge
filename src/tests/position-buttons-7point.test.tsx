import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared/PositionButton';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('PositionButtons - 7-Point Scale with 3-Button Auto-Dropdown UI', () => {
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
    it('renders 3 main button groups (no separate dropdown triggers)', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // P521: 3 group buttons only (no separate chevron triggers)
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);

      expect(screen.getByText('Disagree')).toBeInTheDocument();
      expect(screen.getByText('Unsure')).toBeInTheDocument();
      expect(screen.getByText('Agree')).toBeInTheDocument();
    });

    it('displays aggregated counts as badges (not in brackets)', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      // P521: counts shown as badge pills, not "(N)" format
      // Disagree group: 2 + 8 + 4 = 14
      expect(screen.getByText('14')).toBeInTheDocument();
      // Unsure: 2
      expect(screen.getByText('2')).toBeInTheDocument();
      // Agree group: 3 + 10 + 5 = 18
      expect(screen.getByText('18')).toBeInTheDocument();

      // Old bracket format should NOT be present
      expect(screen.queryByText('(14)')).not.toBeInTheDocument();
      expect(screen.queryByText('(2)')).not.toBeInTheDocument();
      expect(screen.queryByText('(18)')).not.toBeInTheDocument();
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

  describe('Auto-dropdown intensity options', () => {
    it('Disagree auto-dropdown shows intensity options', async () => {
      const user = userEvent.setup();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const disagreeBtn = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeBtn);

      expect(screen.getByText('Strongly Disagree')).toBeInTheDocument();
      expect(screen.getByText('Somewhat Disagree')).toBeInTheDocument();
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

    it('Agree auto-dropdown shows intensity options', async () => {
      const user = userEvent.setup();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const agreeBtn = screen.getByText('Agree').closest('button')!;
      await user.click(agreeBtn);

      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();
      expect(screen.getByText('Strongly Agree')).toBeInTheDocument();
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

      // Click Disagree to open auto-dropdown
      const disagreeBtn = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeBtn);

      // Select Strongly Disagree from dropdown
      await user.click(screen.getByText('Strongly Disagree'));

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

      const disagreeText = screen.getByText(/Disagree\u2212/);
      const button = disagreeText.closest('button');
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('highlights Unsure button when user position is unsure', () => {
      render(
        <PositionButtons
          userPosition="unsure"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const unsureText = screen.getByText('Unsure');
      const button = unsureText.closest('button');
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('highlights Agree group when user has any agree position', () => {
      render(
        <PositionButtons
          userPosition="strongly_agree"
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
        />
      );

      const agreeText = screen.getByText(/Agree\+/);
      const button = agreeText.closest('button');
      expect(button).toHaveAttribute('aria-pressed', 'true');
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
    it('renders 3 button groups in compact mode (no dropdown triggers)', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      // P521: compact mode = 3 group buttons only
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
    });

    it('compact mode hides count badges', () => {
      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={vi.fn()}
          compact
        />
      );

      // Count badges should be hidden in compact mode
      expect(screen.queryByText('14')).not.toBeInTheDocument();
      expect(screen.queryByText('2')).not.toBeInTheDocument();
      expect(screen.queryByText('18')).not.toBeInTheDocument();
    });

    it('compact mode still calls onPositionClick with default values', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <PositionButtons
          userPosition={null}
          counts={sevenPointCounts}
          onPositionClick={handleClick}
          compact
        />
      );

      const agreeBtn = screen.getByText('Agree').closest('button');
      await user.click(agreeBtn!);
      expect(handleClick).toHaveBeenCalledWith('agree');
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
