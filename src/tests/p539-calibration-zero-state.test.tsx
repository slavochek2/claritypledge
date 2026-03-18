/**
 * @file p539-calibration-zero-state.test.tsx
 * P539 — Calibration Zero-State Redesign
 *
 * Tests InlineCalibration component rendering across all states:
 * - Own profile: 0, 1, 2, 3, 4 sessions (dots), 5+ (bar)
 * - Guest profile: 0-4 sessions ("Not yet calibrated"), 5+ (bar)
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
  // OWN PROFILE — DOT STATES (0-4 sessions)
  // =========================================================================

  describe('Own profile — dot states', () => {
    it('shows 5 empty dots and "5 sessions for calibration" at 0 sessions', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={0}
          isOwner={true}
        />
      );

      expect(screen.getByText('5 sessions for calibration')).toBeTruthy();

      // All 5 dots should be empty (no filled dots)
      const container = screen.getByLabelText('0 of 5 sessions completed for calibration');
      expect(container).toBeTruthy();

      // Count dots by test-id or class
      const dots = container.querySelectorAll('[aria-hidden="true"]');
      expect(dots.length).toBe(5);

      // No filled dots (blue background)
      const filledDots = container.querySelectorAll('.bg-blue-500');
      expect(filledDots.length).toBe(0);
    });

    it('shows 1 filled dot and "4 more for calibration" at 1 session', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={1}
          isOwner={true}
        />
      );

      expect(screen.getByText('4 more for calibration')).toBeTruthy();

      const container = screen.getByLabelText('1 of 5 sessions completed for calibration');
      const filledDots = container.querySelectorAll('.bg-blue-500');
      expect(filledDots.length).toBe(1);
    });

    it('shows 2 filled dots and "3 more for calibration" at 2 sessions', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={2}
          isOwner={true}
        />
      );

      expect(screen.getByText('3 more for calibration')).toBeTruthy();

      const container = screen.getByLabelText('2 of 5 sessions completed for calibration');
      const filledDots = container.querySelectorAll('.bg-blue-500');
      expect(filledDots.length).toBe(2);
    });

    it('shows 4 filled dots and singular "1 more for calibration" at 4 sessions', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={4}
          isOwner={true}
        />
      );

      // Singular form — no "sessions" prefix
      expect(screen.getByText('1 more for calibration')).toBeTruthy();

      const container = screen.getByLabelText('4 of 5 sessions completed for calibration');
      const filledDots = container.querySelectorAll('.bg-blue-500');
      expect(filledDots.length).toBe(4);
    });

    it('does not render calibration bar for insufficient status', () => {
      const { container } = render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={2}
          isOwner={true}
        />
      );

      // No bar track or center marker
      const barTrack = container.querySelector('.bg-muted.rounded-full.h-2\\.5');
      expect(barTrack).toBeNull();
    });
  });

  // =========================================================================
  // GUEST PROFILE — "NOT YET CALIBRATED" STATE
  // =========================================================================

  describe('Guest profile — uncalibrated', () => {
    it('shows "Not yet calibrated" text for 0 sessions', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={0}
          isOwner={false}
        />
      );

      expect(screen.getByText('Not yet calibrated')).toBeTruthy();
    });

    it('shows "Not yet calibrated" for 3 sessions (no dots, no progress)', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={3}
          isOwner={false}
        />
      );

      expect(screen.getByText('Not yet calibrated')).toBeTruthy();
      // Should NOT show dots or progress text
      expect(screen.queryByText(/more for calibration/)).toBeNull();
      expect(screen.queryByText(/sessions for calibration/)).toBeNull();
    });

    it('does not render dots on guest profile', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={2}
          isOwner={false}
        />
      );

      // No dot container (aria-label pattern for dots)
      expect(screen.queryByLabelText(/of 5 sessions completed/)).toBeNull();
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
          isOwner={true}
        />
      );

      // Blue dot should exist (the position indicator)
      const blueDot = container.querySelector('.bg-blue-500.rounded-full.w-5');
      expect(blueDot).toBeTruthy();

      // No progress dots or text
      expect(screen.queryByText(/for calibration/)).toBeNull();
      expect(screen.queryByText('Not yet calibrated')).toBeNull();
    });

    it('renders same bar for guest viewing calibrated profile', () => {
      const { container } = render(
        <InlineCalibration
          calibration={CALIBRATED_DATA}
          sessionsCompleted={7}
          isOwner={false}
        />
      );

      // Blue dot should exist
      const blueDot = container.querySelector('.bg-blue-500.rounded-full.w-5');
      expect(blueDot).toBeTruthy();

      // No "Not yet calibrated" text
      expect(screen.queryByText('Not yet calibrated')).toBeNull();
    });
  });

  // =========================================================================
  // TRANSITION GATE — status-based, not count-based
  // =========================================================================

  describe('Transition gate', () => {
    it('shows dots when sessionsCompleted >= 5 but calibration is null (status still insufficient)', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={5}
          isOwner={true}
        />
      );

      // Should show 5 filled dots, NOT the calibration bar
      const container = screen.getByLabelText('5 of 5 sessions completed for calibration');
      const filledDots = container.querySelectorAll('.bg-blue-500');
      expect(filledDots.length).toBe(5);

      // No "more for calibration" text (5-5=0)
      expect(screen.queryByText(/more for calibration/)).toBeNull();
    });

    it('caps filled dots at 5 when sessionsCompleted > 5 but still insufficient', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={8}
          isOwner={true}
        />
      );

      // Should cap at 5 filled dots
      const container = screen.getByLabelText('5 of 5 sessions completed for calibration');
      const filledDots = container.querySelectorAll('.bg-blue-500');
      expect(filledDots.length).toBe(5);
    });

    it('renders bar (not dots) when calibration data exists regardless of count', () => {
      const { container } = render(
        <InlineCalibration
          calibration={CALIBRATED_DATA}
          sessionsCompleted={5}
          isOwner={true}
        />
      );

      // Bar should render (blue position dot)
      const blueDot = container.querySelector('.bg-blue-500.rounded-full.w-5');
      expect(blueDot).toBeTruthy();

      // No dot progress
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
          isOwner={true}
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
          isOwner={true}
        />
      );

      expect(screen.getByText('Understanding Calibration')).toBeTruthy();
    });

    it('uses correct dot sizing classes (w-2.5 h-2.5 rounded-full)', () => {
      const { container } = render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={2}
          isOwner={true}
        />
      );

      const dots = container.querySelectorAll('.w-2\\.5.h-2\\.5.rounded-full');
      expect(dots.length).toBe(5);
    });
  });

  // =========================================================================
  // ACCESSIBILITY
  // =========================================================================

  describe('Accessibility', () => {
    it('dot container has correct aria-label for screen readers', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={3}
          isOwner={true}
        />
      );

      expect(screen.getByLabelText('3 of 5 sessions completed for calibration')).toBeTruthy();
    });

    it('individual dots are aria-hidden', () => {
      render(
        <InlineCalibration
          calibration={null}
          sessionsCompleted={2}
          isOwner={true}
        />
      );

      const dotContainer = screen.getByLabelText('2 of 5 sessions completed for calibration');
      const dots = dotContainer.querySelectorAll('[aria-hidden="true"]');
      expect(dots.length).toBe(5);
    });
  });
});
