/**
 * @file p539-calibration-zero-state.test.tsx
 * P539 — Calibration Zero-State Redesign
 *
 * Tests InlineCalibration component — consistent structure for both states:
 * - Not enough data: "Calibration" header + segmented bar + "N more clarity sessions needed"
 * - Estimation available: "Calibration" header + full bar + calibration label
 * Shown on ALL profiles (own + guest).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InlineCalibration, type UserCalibration } from '@/app/components/profile/calibration-display';

const CALIBRATED_DATA: UserCalibration = {
  listener: { avgGap: 0.3, state: 'calibrated', sessionCount: 7 },
  speaker: { avgGap: -0.5, state: 'overconfident', sessionCount: 7 },
};

describe('P539: InlineCalibration', () => {
  // =========================================================================
  // CONSISTENT HEADER
  // =========================================================================

  describe('Consistent header', () => {
    it('shows "Calibration" header for uncalibrated state', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={0} />);
      expect(screen.getByText('Listening calibration')).toBeTruthy();
    });

    it('shows "Calibration" header for calibrated state', () => {
      render(<InlineCalibration calibration={CALIBRATED_DATA} sessionsCompleted={7} />);
      expect(screen.getByText('Listening calibration')).toBeTruthy();
    });
  });

  // =========================================================================
  // NOT ENOUGH DATA — SEGMENTED BAR
  // =========================================================================

  describe('Not enough data — segmented bar', () => {
    it('shows unlock prompt at 0 sessions', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={0} />);
      expect(screen.getByText('Complete 5 sessions in a listener role to unlock your calibration score')).toBeTruthy();
      const container = screen.getByLabelText('0 of 5 listener sessions completed');
      expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(5);
    });

    it('shows "4 more sessions in a listener role" at 1 session', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={1} />);
      expect(screen.getByText('4 more sessions in a listener role to unlock your calibration score')).toBeTruthy();
      const container = screen.getByLabelText('1 of 5 listener sessions completed');
      expect(container.querySelectorAll('[class*="bg-blue-400"]').length).toBe(1);
    });

    it('shows "3 more sessions in a listener role" at 2 sessions', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={2} />);
      expect(screen.getByText('3 more sessions in a listener role to unlock your calibration score')).toBeTruthy();
    });

    it('uses singular "1 more session in a listener role" at 4 sessions', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={4} />);
      expect(screen.getByText('1 more session in a listener role to unlock your calibration score')).toBeTruthy();
      const container = screen.getByLabelText('4 of 5 listener sessions completed');
      expect(container.querySelectorAll('[class*="bg-blue-400"]').length).toBe(4);
    });

    it('does not render calibration bar for insufficient status', () => {
      const { container } = render(<InlineCalibration calibration={null} sessionsCompleted={2} />);
      expect(container.querySelector('.bg-blue-500.rounded-full.w-5')).toBeNull();
    });
  });

  // =========================================================================
  // ESTIMATION AVAILABLE — FULL BAR + LABEL
  // =========================================================================

  describe('Estimation available — bar (label in tooltip only)', () => {
    it('renders full-width bar with blue position dot', () => {
      const { container } = render(
        <InlineCalibration calibration={CALIBRATED_DATA} sessionsCompleted={7} />
      );
      expect(container.querySelector('.bg-blue-500.rounded-full.w-5')).toBeTruthy();
    });

    it('does not show progress text when estimation available', () => {
      render(<InlineCalibration calibration={CALIBRATED_DATA} sessionsCompleted={7} />);
      expect(screen.queryByText(/in a listener role to unlock/)).toBeNull();
      expect(screen.queryByLabelText(/of 5 listener sessions completed/)).toBeNull();
    });
  });

  // =========================================================================
  // TRANSITION GATE — status-based
  // =========================================================================

  describe('Transition gate', () => {
    it('shows segmented bar when sessionsCompleted >= 5 but calibration is null', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={5} />);
      const container = screen.getByLabelText('5 of 5 listener sessions completed');
      expect(container.querySelectorAll('[class*="bg-blue-400"]').length).toBe(5);
      expect(screen.queryByText(/in a listener role to unlock/)).toBeNull();
    });

    it('caps filled segments at 5 when sessionsCompleted > 5', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={8} />);
      const container = screen.getByLabelText('5 of 5 listener sessions completed');
      expect(container.querySelectorAll('[class*="bg-blue-400"]').length).toBe(5);
    });

    it('renders bar when calibration data exists regardless of count', () => {
      const { container } = render(
        <InlineCalibration calibration={CALIBRATED_DATA} sessionsCompleted={5} />
      );
      expect(container.querySelector('.bg-blue-500.rounded-full.w-5')).toBeTruthy();
      expect(screen.queryByLabelText(/of 5 listener sessions completed/)).toBeNull();
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge cases', () => {
    it('defaults to 0 sessions when sessionsCompleted is undefined', () => {
      render(<InlineCalibration calibration={null} />);
      expect(screen.getByText('Complete 5 sessions in a listener role to unlock your calibration score')).toBeTruthy();
    });

    it('renders as block with consistent mt-3 spacing', () => {
      const { container } = render(<InlineCalibration calibration={null} sessionsCompleted={0} />);
      const wrapper = container.querySelector('.mt-3');
      expect(wrapper).toBeTruthy();
    });
  });

  // =========================================================================
  // ACCESSIBILITY
  // =========================================================================

  describe('Accessibility', () => {
    it('segmented bar has aria-label', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={3} />);
      expect(screen.getByLabelText('3 of 5 listener sessions completed')).toBeTruthy();
    });

    it('individual segments are aria-hidden', () => {
      render(<InlineCalibration calibration={null} sessionsCompleted={2} />);
      const container = screen.getByLabelText('2 of 5 listener sessions completed');
      expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(5);
    });
  });
});
