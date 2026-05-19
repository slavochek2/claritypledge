/**
 * @file p847-position-buttons-explicit-clear.test.tsx
 * @description Unit tests for P847: Position Buttons — Explicit-Clear Interaction Model
 *
 * Tests the redesigned PositionButtons component (Model C′):
 * - Common path: click unselected group → selects default intensity, NO menu
 * - Refine path: click selected group → opens menu (intensity rows + "Clear position")
 * - Intensity selection from menu → calls onPositionClick(intensity), closes menu
 * - Explicit clear via "Clear position" row → calls onClear(), never onPositionClick
 * - Dismiss paths: Escape and click-outside close menu without mutation
 * - Unsure special case: single-click selects, selected-click opens 1-row Clear menu
 * - Regression invariants: no silent vote removal from segment clicks
 * - API back-compat: compact, narrow, disabled, onClear optional
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

describe('P847: PositionButtons — Explicit-Clear Interaction Model', () => {
  // ─── Common path: click unselected group ─────────────────────────────────

  describe('Common path: click unselected group', () => {
    it('click unselected Agree → calls onPositionClick("agree"), no menu opens', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={onPositionClick}
        />
      );

      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      expect(onPositionClick).toHaveBeenCalledTimes(1);
      expect(onPositionClick).toHaveBeenCalledWith('agree');

      // No intensity menu should appear
      expect(screen.queryByText('Somewhat Agree')).not.toBeInTheDocument();
      expect(screen.queryByText('Strongly Agree')).not.toBeInTheDocument();
      expect(screen.queryByText(/Clear position/i)).not.toBeInTheDocument();
    });

    it('click unselected Disagree → calls onPositionClick("disagree"), no menu opens', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={onPositionClick}
        />
      );

      const disagreeButton = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeButton);

      expect(onPositionClick).toHaveBeenCalledTimes(1);
      expect(onPositionClick).toHaveBeenCalledWith('disagree');

      expect(screen.queryByText('Somewhat Disagree')).not.toBeInTheDocument();
      expect(screen.queryByText('Strongly Disagree')).not.toBeInTheDocument();
      expect(screen.queryByText(/Clear position/i)).not.toBeInTheDocument();
    });

    it('switching from Agree to Disagree → calls onPositionClick("disagree"), no menu opens', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
        />
      );

      const disagreeButton = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeButton);

      expect(onPositionClick).toHaveBeenCalledTimes(1);
      expect(onPositionClick).toHaveBeenCalledWith('disagree');
      expect(screen.queryByText(/Clear position/i)).not.toBeInTheDocument();
    });
  });

  // ─── Refine path: click already-selected group ───────────────────────────

  describe('Refine path: click already-selected group', () => {
    it('click selected Agree → menu opens, onPositionClick NOT called', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      const agreeButton = screen.getByText('Agree').closest('button')!;
      await user.click(agreeButton);

      // Menu must open
      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();
      // No mutation
      expect(onPositionClick).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    });

    it('click selected Disagree → menu opens, onPositionClick NOT called', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="disagree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      const disagreeButton = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeButton);

      expect(screen.getByText('Somewhat Disagree')).toBeInTheDocument();
      expect(onPositionClick).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    });

    it('click selected strongly_agree → menu opens showing intensity rows + Clear position', async () => {
      const user = userEvent.setup();
      render(
        <PositionButtons
          userPosition="strongly_agree"
          counts={mixedCounts}
          onPositionClick={vi.fn()}
          onClear={vi.fn()}
        />
      );

      // Agree segment shows "Agree+" when strongly selected
      const agreeButton = screen.getByText('Agree+').closest('button')!;
      await user.click(agreeButton);

      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();
      expect(screen.getByText('Strongly Agree')).toBeInTheDocument();
      expect(screen.getByText(/Clear position/i)).toBeInTheDocument();
    });
  });

  // ─── Menu structure ──────────────────────────────────────────────────────

  describe('Menu structure', () => {
    it('Agree menu contains 3 intensity rows, separator, and "Clear position" row', async () => {
      const user = userEvent.setup();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={vi.fn()}
          onClear={vi.fn()}
        />
      );

      await user.click(screen.getByText('Agree').closest('button')!);

      // 3 intensity rows — scope to role="option" to disambiguate from the segment label
      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Agree' })).toBeInTheDocument();
      expect(screen.getByText('Strongly Agree')).toBeInTheDocument();
      // "Clear position" row always present
      expect(screen.getByText(/Clear position/i)).toBeInTheDocument();
    });

    it('Disagree menu contains 3 intensity rows and "Clear position" row', async () => {
      const user = userEvent.setup();
      render(
        <PositionButtons
          userPosition="disagree"
          counts={mixedCounts}
          onPositionClick={vi.fn()}
          onClear={vi.fn()}
        />
      );

      await user.click(screen.getByText('Disagree').closest('button')!);

      expect(screen.getByText('Somewhat Disagree')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Disagree' })).toBeInTheDocument();
      expect(screen.getByText('Strongly Disagree')).toBeInTheDocument();
      expect(screen.getByText(/Clear position/i)).toBeInTheDocument();
    });

    it('"Clear position" row is present and has red styling class', async () => {
      const user = userEvent.setup();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={vi.fn()}
          onClear={vi.fn()}
        />
      );

      await user.click(screen.getByText('Agree').closest('button')!);

      const clearRow = screen.getByText(/Clear position/i).closest('button')!;
      expect(clearRow).toBeInTheDocument();
      // Red text class per V4 design spec
      expect(clearRow).toHaveClass('text-red-600');
    });
  });

  // ─── Intensity selection from menu ───────────────────────────────────────

  describe('Intensity selection from menu', () => {
    it('clicking "Strongly Agree" → calls onPositionClick("strongly_agree"), closes menu', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={vi.fn()}
        />
      );

      await user.click(screen.getByText('Agree').closest('button')!);
      await user.click(screen.getByText('Strongly Agree'));

      expect(onPositionClick).toHaveBeenCalledTimes(1);
      expect(onPositionClick).toHaveBeenCalledWith('strongly_agree');
      // Menu closes
      expect(screen.queryByText('Somewhat Agree')).not.toBeInTheDocument();
    });

    it('clicking "Somewhat Disagree" → calls onPositionClick("somewhat_disagree"), closes menu', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition="disagree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={vi.fn()}
        />
      );

      await user.click(screen.getByText('Disagree').closest('button')!);
      await user.click(screen.getByText('Somewhat Disagree'));

      expect(onPositionClick).toHaveBeenCalledTimes(1);
      expect(onPositionClick).toHaveBeenCalledWith('somewhat_disagree');
      expect(screen.queryByText('Strongly Disagree')).not.toBeInTheDocument();
    });

    it('clicking "Somewhat Agree" → calls onPositionClick("somewhat_agree")', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={vi.fn()}
        />
      );

      await user.click(screen.getByText('Agree').closest('button')!);
      await user.click(screen.getByText('Somewhat Agree'));

      expect(onPositionClick).toHaveBeenCalledWith('somewhat_agree');
    });
  });

  // ─── Explicit clear ───────────────────────────────────────────────────────

  describe('Explicit clear', () => {
    it('clicking "Clear position" → calls onClear() exactly once', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      await user.click(screen.getByText('Agree').closest('button')!);
      await user.click(screen.getByText(/Clear position/i));

      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('clicking "Clear position" → does NOT call onPositionClick', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      await user.click(screen.getByText('Agree').closest('button')!);
      await user.click(screen.getByText(/Clear position/i));

      expect(onPositionClick).not.toHaveBeenCalled();
    });

    it('clicking "Clear position" → closes menu', async () => {
      const user = userEvent.setup();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={vi.fn()}
          onClear={vi.fn()}
        />
      );

      await user.click(screen.getByText('Agree').closest('button')!);
      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();

      await user.click(screen.getByText(/Clear position/i));

      expect(screen.queryByText('Somewhat Agree')).not.toBeInTheDocument();
      expect(screen.queryByText(/Clear position/i)).not.toBeInTheDocument();
    });

    it('clicking "Clear position" from Disagree menu → calls onClear(), not onPositionClick', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="disagree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      await user.click(screen.getByText('Disagree').closest('button')!);
      await user.click(screen.getByText(/Clear position/i));

      expect(onClear).toHaveBeenCalledTimes(1);
      expect(onPositionClick).not.toHaveBeenCalled();
    });
  });

  // ─── Escape dismisses without mutation ───────────────────────────────────

  describe('Escape dismisses without mutation', () => {
    it('Escape with Agree menu open → closes menu, neither callback fired', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      await user.click(screen.getByText('Agree').closest('button')!);
      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();

      // Use fireEvent for Escape — compatible with userEvent without fake timers
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByText('Somewhat Agree')).not.toBeInTheDocument();
      expect(onPositionClick).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    });

    it('Escape with Disagree menu open → closes menu without mutation', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="disagree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      await user.click(screen.getByText('Disagree').closest('button')!);
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByText('Somewhat Disagree')).not.toBeInTheDocument();
      expect(onPositionClick).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    });
  });

  // ─── Click outside dismisses without mutation ─────────────────────────────

  describe('Click outside dismisses without mutation', () => {
    it('mousedown outside menu → closes menu without firing callbacks', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <div>
          <PositionButtons
            userPosition="agree"
            counts={mixedCounts}
            onPositionClick={onPositionClick}
            onClear={onClear}
          />
          <div data-testid="outside">Outside area</div>
        </div>
      );

      await user.click(screen.getByText('Agree').closest('button')!);
      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();

      // Simulate mousedown outside — the component uses mousedown listener
      fireEvent.mouseDown(screen.getByTestId('outside'));

      expect(screen.queryByText('Somewhat Agree')).not.toBeInTheDocument();
      expect(onPositionClick).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    });
  });

  // ─── Unsure single click selects ─────────────────────────────────────────

  describe('Unsure single click selects', () => {
    it('click unselected Unsure → calls onPositionClick("unsure"), no menu opens', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition={null}
          counts={zeroCounts}
          onPositionClick={onPositionClick}
        />
      );

      await user.click(screen.getByText('Unsure').closest('button')!);

      expect(onPositionClick).toHaveBeenCalledTimes(1);
      expect(onPositionClick).toHaveBeenCalledWith('unsure');
      expect(screen.queryByText(/Clear position/i)).not.toBeInTheDocument();
    });
  });

  // ─── Unsure selected opens 1-row menu ────────────────────────────────────

  describe('Unsure selected opens 1-row menu', () => {
    it('click selected Unsure → menu opens with ONLY "Clear position" row (no Somewhat/Strongly)', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="unsure"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      await user.click(screen.getByText('Unsure').closest('button')!);

      // Only the Clear row — no intensity variants exist for Unsure
      expect(screen.getByText(/Clear position/i)).toBeInTheDocument();
      expect(screen.queryByText('Somewhat Unsure')).not.toBeInTheDocument();
      expect(screen.queryByText('Strongly Unsure')).not.toBeInTheDocument();
      // Architect Decision C: Unsure menu is STRICTLY 1 row (no redundant "Unsure" intensity row).
      // If a default-intensity row with label "Unsure" rendered alongside the Clear row,
      // getAllByText('Unsure') would return 2 (segment label + menu row). It must return 1.
      expect(screen.getAllByText('Unsure')).toHaveLength(1);
      // No mutation yet
      expect(onPositionClick).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    });

    it('Unsure 1-row menu: clicking "Clear position" calls onClear()', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="unsure"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      await user.click(screen.getByText('Unsure').closest('button')!);
      await user.click(screen.getByText(/Clear position/i));

      expect(onClear).toHaveBeenCalledTimes(1);
      expect(onPositionClick).not.toHaveBeenCalled();
    });

    it('Unsure 1-row menu: Escape closes without mutation', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="unsure"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      await user.click(screen.getByText('Unsure').closest('button')!);
      expect(screen.getByText(/Clear position/i)).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByText(/Clear position/i)).not.toBeInTheDocument();
      expect(onPositionClick).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    });
  });

  // ─── Regression: no silent removes from segment clicks ───────────────────

  describe('Regression: no silent removes from segment clicks', () => {
    it('two-click sequence on Agree never calls onPositionClick(userPosition) or onClear', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      const agreeButton = screen.getByText('Agree').closest('button')!;
      // First click: should open menu (selected group)
      await user.click(agreeButton);
      // Second click on the same segment while menu is open: must NOT remove
      await user.click(agreeButton);

      // onPositionClick must never be called with 'agree' (the current userPosition)
      const calledWithAgree = onPositionClick.mock.calls.some(([arg]) => arg === 'agree');
      expect(calledWithAgree).toBe(false);
      // onClear must not fire from a segment click
      expect(onClear).not.toHaveBeenCalled();
    });

    it('two-click sequence on Disagree never silently removes', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="disagree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      const disagreeButton = screen.getByText('Disagree').closest('button')!;
      await user.click(disagreeButton);
      await user.click(disagreeButton);

      const calledWithDisagree = onPositionClick.mock.calls.some(([arg]) => arg === 'disagree');
      expect(calledWithDisagree).toBe(false);
      expect(onClear).not.toHaveBeenCalled();
    });

    it('two-click on Unsure never silently removes (Escape = only dismiss)', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      const onClear = vi.fn();
      render(
        <PositionButtons
          userPosition="unsure"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={onClear}
        />
      );

      const unsureButton = screen.getByText('Unsure').closest('button')!;
      await user.click(unsureButton); // opens 1-row menu
      await user.click(unsureButton); // second click: may toggle menu open/closed only

      // onPositionClick must not be called with 'unsure'
      const calledWithUnsure = onPositionClick.mock.calls.some(([arg]) => arg === 'unsure');
      expect(calledWithUnsure).toBe(false);
      expect(onClear).not.toHaveBeenCalled();
    });
  });

  // ─── Regression: deleted branch — handleGroupClick never calls onPositionClick(userPosition) ─

  describe('Regression: deleted branch — handleGroupClick never calls onPositionClick(userPosition)', () => {
    it('any sequence of segment clicks on selected Agree never produces onPositionClick("agree")', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={vi.fn()}
        />
      );

      const agreeButton = screen.getByText('Agree').closest('button')!;
      // Three rapid clicks: open, toggle-attempt, toggle-attempt
      await user.click(agreeButton);
      await user.click(agreeButton);
      await user.click(agreeButton);

      // The deleted branch at lines 254-258 would fire onPositionClick('agree').
      // With P847, this must never happen.
      expect(onPositionClick).not.toHaveBeenCalledWith('agree');
    });

    it('any sequence on selected strongly_disagree never produces onPositionClick("strongly_disagree")', async () => {
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition="strongly_disagree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          onClear={vi.fn()}
        />
      );

      const disagreeButton = screen.getByText('Disagree+').closest('button')!;
      await user.click(disagreeButton);
      await user.click(disagreeButton);

      expect(onPositionClick).not.toHaveBeenCalledWith('strongly_disagree');
    });
  });

  // ─── API back-compat ─────────────────────────────────────────────────────

  describe('API back-compat', () => {
    it('accepts compact prop without throwing', () => {
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

    it('accepts narrow prop without throwing', () => {
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

    it('accepts disabled prop without throwing', () => {
      expect(() => {
        render(
          <PositionButtons
            userPosition={null}
            counts={zeroCounts}
            onPositionClick={vi.fn()}
            disabled
          />
        );
      }).not.toThrow();
    });

    it('Clear row is HIDDEN when onClear prop is absent (Decision A)', async () => {
      // Architect Decision A: when consumer does not wire onClear, the Clear row is hidden.
      // This preserves the "no consumer edits" promise — consumers that haven't migrated
      // keep their existing guardedRemovePosition flow via onPositionClick toggle, and
      // the new in-menu Clear affordance simply doesn't appear for them.
      const user = userEvent.setup();
      const onPositionClick = vi.fn();
      render(
        <PositionButtons
          userPosition="agree"
          counts={mixedCounts}
          onPositionClick={onPositionClick}
          // onClear intentionally omitted
        />
      );

      // Open menu by clicking the selected Agree segment
      await user.click(screen.getByText('Agree').closest('button')!);

      // Refine path still works without onClear — intensity rows render
      expect(screen.getByText('Somewhat Agree')).toBeInTheDocument();
      expect(screen.getByText('Strongly Agree')).toBeInTheDocument();

      // Clear row MUST be absent when onClear is undefined
      expect(screen.queryByText(/Clear position/i)).not.toBeInTheDocument();

      // No spurious onPositionClick call from opening the menu
      expect(onPositionClick).not.toHaveBeenCalled();
    });

    it('accepts undefined onClear without throwing on render', () => {
      // Pure render smoke check — no interaction
      expect(() => {
        render(
          <PositionButtons
            userPosition="agree"
            counts={mixedCounts}
            onPositionClick={vi.fn()}
            // onClear intentionally omitted
          />
        );
      }).not.toThrow();
    });

    it('accepts all 7 position types as userPosition without throwing', () => {
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
