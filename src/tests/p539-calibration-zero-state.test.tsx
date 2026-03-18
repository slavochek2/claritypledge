/**
 * @file p539-calibration-zero-state.test.tsx
 * P539 — Calibration Zero-State Redesign
 *
 * Tests InlineCalibration component rendering across all states:
 * - Own profile: 0, 1, 2, 4 sessions (segmented bar), 5+ (calibration bar)
 * - Guest uncalibrated: component not rendered by parent (no test needed here)
 * - Guest calibrated: existing bar
 * - Edge cases: undefined sessionsCompleted, sessionsCompleted > 5 with insufficient status
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InlineCalibration, type UserCalibration } from '@/app/components/profile/calibration-display';

const CALIBRATED_DATA: UserCalibration = {
  listener: { avgGap: 0.3, state: 'calibrated', sessionCount: 7 },
  speaker: { avgGap: -0.5, state: 'overconfident', sessionCount: 7 },
};

describe('P539: InlineCalibration zero-state redesign', () => {
  // =========================================================================
  // OWN PROFILE — SEGMENTED BAR STATES (0-4 sessions)
  // =========================================================================

  describe('Own profile — segmented bar states', () => {
    it('shows 5 empty segments and "5 sessions for calibration" at 0 sessions', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={0}
        />
      );

      expect(screen.getByText('5 sessions for calibration')).toBeTruthy();

      const container = screen.getByLabelText('0 of 5 sessions completed for calibration');
      expect(container).toBeTruthy();

      const segments = container.querySelectorAll('[aria-hidden="true"]');
      expect(segments.length).toBe(5);

      // No filled segments (blue-400 background)
      const filledSegments = container.querySelectorAll('[class*="bg-blue-400"]');
      expect(filledSegments.length).toBe(0);
    });

    it('shows 1 filled segment and "4 more for calibration" at 1 session', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={1}
        />
      );

      expect(screen.getByText('4 more for calibration')).toBeTruthy();

      const container = screen.getByLabelText('1 of 5 sessions completed for calibration');
      const filledSegments = container.querySelectorAll('[class*="bg-blue-400"]');
      expect(filledSegments.length).toBe(1);
    });

    it('shows 2 filled segments and "3 more for calibration" at 2 sessions', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={2}
        />
      );

      expect(screen.getByText('3 more for calibration')).toBeTruthy();

      const container = screen.getByLabelText('2 of 5 sessions completed for calibration');
      const filledSegments = container.querySelectorAll('[class*="bg-blue-400"]');
      expect(filledSegments.length).toBe(2);
    });

    it('shows 4 filled segments and singular "1 more for calibration" at 4 sessions', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={4}
        />
      );

      expect(screen.getByText('1 more for calibration')).toBeTruthy();

      const container = screen.getByLabelText('4 of 5 sessions completed for calibration');
      const filledSegments = container.querySelectorAll('[class*="bg-blue-400"]');
      expect(filledSegments.length).toBe(4);
    });

    it('does not render calibration bar for insufficient status', () => {
      const { container } = render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={2}
        />
      );

      // No bar position indicator (blue dot)
      const blueDot = container.querySelector('.bg-blue-500.rounded-full.w-5');
      expect(blueDot).toBeNull();
    });
  });

  // =========================================================================
  // CALIBRATED STATE (both own and guest — existing bar)
  // =========================================================================

  describe('Calibrated state — existing bar unchanged', () => {
    it('renders calibration bar with blue dot when calibration data exists (own profile)', () => {
      const { container } = render(
        <InlineCalibration
          calibration={CALIBRATED_DATA}
          sessionsCompleted={7}
        />
      );

      const blueDot = container.querySelector('.bg-blue-500.rounded-full.w-5');
      expect(blueDot).toBeTruthy();

      // No progress text
      expect(screen.queryByText(/for calibration/)).toBeNull();
    });

    it('renders same bar for guest viewing calibrated profile', () => {
      const { container } = render(
        <InlineCalibration
          calibration={CALIBRATED_DATA}
          sessionsCompleted={7}
        />
      );

      const blueDot = container.querySelector('.bg-blue-500.rounded-full.w-5');
      expect(blueDot).toBeTruthy();
    });
  });

  // =========================================================================
  // TRANSITION GATE — status-based, not count-based
  // =========================================================================

  describe('Transition gate', () => {
    it('shows segmented bar when sessionsCompleted >= 5 but calibration is null', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={5}
        />
      );

      const container = screen.getByLabelText('5 of 5 sessions completed for calibration');
      const filledSegments = container.querySelectorAll('[class*="bg-blue-400"]');
      expect(filledSegments.length).toBe(5);

      // No "more for calibration" text (5-5=0)
      expect(screen.queryByText(/more for calibration/)).toBeNull();
    });

    it('caps filled segments at 5 when sessionsCompleted > 5 but still insufficient', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={8}
        />
      );

      const container = screen.getByLabelText('5 of 5 sessions completed for calibration');
      const filledSegments = container.querySelectorAll('[class*="bg-blue-400"]');
      expect(filledSegments.length).toBe(5);
    });

    it('renders bar (not segments) when calibration data exists regardless of count', () => {
      const { container } = render(
        <InlineCalibration
          calibration={CALIBRATED_DATA}
          sessionsCompleted={5}
        />
      );

      const blueDot = container.querySelector('.bg-blue-500.rounded-full.w-5');
      expect(blueDot).toBeTruthy();

      expect(screen.queryByLabelText(/of 5 sessions completed/)).toBeNull();
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge cases', () => {
    it('defaults to 0 sessions when sessionsCompleted is undefined', () => {
      render(
        <InlineCalibration
          calibration={null}
        />
      );

      expect(screen.getByText('5 sessions for calibration')).toBeTruthy();
      const container = screen.getByLabelText('0 of 5 sessions completed for calibration');
      expect(container).toBeTruthy();
    });

    it('always renders ear icon and "Understanding Calibration" header', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={0}
        />
      );

      expect(screen.getByText('Understanding Calibration')).toBeTruthy();
    });

    it('uses segmented bar with h-1.5 and rounded-sm classes', () => {
      const { container } = render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={2}
        />
      );

      const segments = container.querySelectorAll('.h-1\\.5.rounded-sm');
      expect(segments.length).toBe(5);
    });
  });

  // =========================================================================
  // ACCESSIBILITY
  // =========================================================================

  describe('Accessibility', () => {
    it('segment container has correct aria-label for screen readers', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={3}
        />
      );

      expect(screen.getByLabelText('3 of 5 sessions completed for calibration')).toBeTruthy();
    });

    it('individual segments are aria-hidden', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={2}
        />
      );

      const segmentContainer = screen.getByLabelText('2 of 5 sessions completed for calibration');
      const segments = segmentContainer.querySelectorAll('[aria-hidden="true"]');
      expect(segments.length).toBe(5);
    });
  });
});
