/**
 * @file p539-calibration-zero-state.test.tsx
 * P539 — Calibration Zero-State Redesign (V10: Metadata-line treatment)
 *
 * Tests InlineCalibration component rendering:
 * - Uncalibrated: segmented bar + progress text as metadata line
 * - Calibrated: label + tiny inline bar as metadata line
 * - Edge cases: undefined sessionsCompleted, sessionsCompleted > 5 with insufficient status
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InlineCalibration, type UserCalibration } from '@/app/components/profile/calibration-display';

const CALIBRATED_DATA: UserCalibration = {
  listener: { avgGap: 0.3, state: 'calibrated', sessionCount: 7 },
  speaker: { avgGap: -0.5, state: 'overconfident', sessionCount: 7 },
};

describe('P539: InlineCalibration metadata-line', () => {
  // =========================================================================
  // UNCALIBRATED — SEGMENTED BAR (own profile only, parent hides for guest)
  // =========================================================================

  describe('Uncalibrated — segmented bar', () => {
    it('shows "5 sessions for calibration" at 0 sessions', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={0} />);
      expect(screen.getByText('5 sessions for calibration')).toBeTruthy();
      const container = screen.getByLabelText('0 of 5 sessions completed for calibration');
      expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(5);
    });

    it('shows 1 filled segment and "4 more for calibration" at 1 session', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={1} />);
      expect(screen.getByText('4 more for calibration')).toBeTruthy();
      const container = screen.getByLabelText('1 of 5 sessions completed for calibration');
      expect(container.querySelectorAll('[class*="bg-blue-400"]').length).toBe(1);
    });

    it('shows 2 filled segments and "3 more for calibration"', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={2} />);
      expect(screen.getByText('3 more for calibration')).toBeTruthy();
      const container = screen.getByLabelText('2 of 5 sessions completed for calibration');
      expect(container.querySelectorAll('[class*="bg-blue-400"]').length).toBe(2);
    });

    it('uses singular "1 more for calibration" at 4 sessions', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={4} />);
      expect(screen.getByText('1 more for calibration')).toBeTruthy();
      const container = screen.getByLabelText('4 of 5 sessions completed for calibration');
      expect(container.querySelectorAll('[class*="bg-blue-400"]').length).toBe(4);
    });

    it('does not render calibration position dot for insufficient status', () => {
      const { container } = render(<InlineCalibration calibration={null} sessionsCompleted={2} />);
      expect(container.querySelector('.bg-blue-500.rounded-full')).toBeNull();
    });
  });

  // =========================================================================
  // CALIBRATED — LABEL + FULL BAR
  // =========================================================================

  describe('Calibrated — label + bar', () => {
    it('shows calibration label text', () => {
      render(<InlineCalibration calibration={CALIBRATED_DATA} sessionsCompleted={7} />);
      expect(screen.getByText('Well calibrated')).toBeTruthy();
    });

    it('renders full-width bar with blue position dot', () => {
      const { container } = render(
        <InlineCalibration calibration={CALIBRATED_DATA} sessionsCompleted={7} />
      );
      const dot = container.querySelector('.bg-blue-500.rounded-full.w-5');
      expect(dot).toBeTruthy();
    });

    it('does not show progress text when calibrated', () => {
      render(<InlineCalibration calibration={CALIBRATED_DATA} sessionsCompleted={7} />);
      expect(screen.queryByText(/for calibration/)).toBeNull();
      expect(screen.queryByLabelText(/of 5 sessions completed/)).toBeNull();
    });
  });

  // =========================================================================
  // TRANSITION GATE — status-based, not count-based
  // =========================================================================

  describe('Transition gate', () => {
    it('shows segmented bar when sessionsCompleted >= 5 but calibration is null', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={5} />);
      const container = screen.getByLabelText('5 of 5 sessions completed for calibration');
      expect(container.querySelectorAll('[class*="bg-blue-400"]').length).toBe(5);
      expect(screen.queryByText(/more for calibration/)).toBeNull();
    });

    it('caps filled segments at 5 when sessionsCompleted > 5', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={8} />);
      const container = screen.getByLabelText('5 of 5 sessions completed for calibration');
      expect(container.querySelectorAll('[class*="bg-blue-400"]').length).toBe(5);
    });

    it('renders label (not segments) when calibration data exists', () => {
      render(<InlineCalibration calibration={CALIBRATED_DATA} sessionsCompleted={5} />);
      expect(screen.getByText('Well calibrated')).toBeTruthy();
      expect(screen.queryByLabelText(/of 5 sessions completed/)).toBeNull();
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge cases', () => {
    it('defaults to 0 sessions when sessionsCompleted is undefined', () => {
      render(<InlineCalibration calibration={null} />);
      expect(screen.getByText('5 sessions for calibration')).toBeTruthy();
      expect(screen.getByLabelText('0 of 5 sessions completed for calibration')).toBeTruthy();
    });

    it('renders as inline element (not block)', () => {
      const { container } = render(<InlineCalibration calibration={null} sessionsCompleted={0} />);
      const wrapper = container.querySelector('.inline-flex');
      expect(wrapper).toBeTruthy();
    });
  });

  // =========================================================================
  // ACCESSIBILITY
  // =========================================================================

  describe('Accessibility', () => {
    it('segmented bar container has aria-label for screen readers', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={3} />);
      expect(screen.getByLabelText('3 of 5 sessions completed for calibration')).toBeTruthy();
    });

    it('individual segments are aria-hidden', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={2} />);
      const container = screen.getByLabelText('2 of 5 sessions completed for calibration');
      expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(5);
    });

    it('ear icon is aria-hidden (decorative)', () => {
      const { container } = render(<InlineCalibration calibration={null} sessionsCompleted={0} />);
      const ear = container.querySelector('[aria-hidden="true"].h-4');
      expect(ear).toBeTruthy();
    });
  });
});
