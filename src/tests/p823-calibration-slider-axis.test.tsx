/**
 * P823: Calibration slider axis inverted
 *
 * Canary: "Somewhat underconfident" dot must be LEFT of center (<50%).
 * Before fix: gapToPosition(0.75) = 62.5% (right of center) — FAILS
 * After fix:  gapToPosition(0.75) = 37.5% (left of center)  — PASSES
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { InlineCalibration, CalibrationDisplay, type UserCalibration } from '@/app/components/profile/calibration-display';

const UNDERCONFIDENT: UserCalibration = {
  listener: { avgGap: 0.75, state: 'underconfident', sessionCount: 10 },
  speaker: { avgGap: 0.75, state: 'underconfident', sessionCount: 10 },
};

const OVERCONFIDENT: UserCalibration = {
  listener: { avgGap: -0.75, state: 'overconfident', sessionCount: 10 },
  speaker: { avgGap: -0.75, state: 'overconfident', sessionCount: 10 },
};

const CALIBRATED: UserCalibration = {
  listener: { avgGap: 0, state: 'calibrated', sessionCount: 10 },
  speaker: { avgGap: 0, state: 'calibrated', sessionCount: 10 },
};

// InlineCalibration dot: w-5, plain `X%` left style
function getInlineDotLeft(container: HTMLElement): number {
  const dot = container.querySelector('.bg-blue-500.rounded-full.w-5') as HTMLElement;
  if (!dot) throw new Error('InlineCalibration dot not found');
  return parseFloat(dot.style.left);
}

// CalibrationBar dot (inside CalibrationDisplay): w-3.5, `calc(X% - 7px)` left style
function getCalibrationBarDotLeftPercent(container: HTMLElement): number {
  const dots = Array.from(container.querySelectorAll('.bg-blue-500.rounded-full')) as HTMLElement[];
  const barDot = dots.find(el => el.style.left.startsWith('calc('));
  if (!barDot) throw new Error('CalibrationBar dot not found');
  const match = barDot.style.left.match(/calc\((\d+\.?\d*)%/);
  if (!match) throw new Error(`Unexpected left style: ${barDot.style.left}`);
  return parseFloat(match[1]);
}

describe('P823: Calibration slider axis direction — InlineCalibration', () => {
  it('underconfident (gap=0.75) dot is LEFT of center (<50%)', () => {
    const { container } = render(
      <InlineCalibration calibration={UNDERCONFIDENT} sessionsCompleted={10} />
    );
    expect(getInlineDotLeft(container)).toBeLessThan(50);
  });

  it('overconfident (gap=-0.75) dot is RIGHT of center (>50%)', () => {
    const { container } = render(
      <InlineCalibration calibration={OVERCONFIDENT} sessionsCompleted={10} />
    );
    expect(getInlineDotLeft(container)).toBeGreaterThan(50);
  });

  it('well-calibrated (gap=0) dot is AT center (50%)', () => {
    const { container } = render(
      <InlineCalibration calibration={CALIBRATED} sessionsCompleted={10} />
    );
    expect(getInlineDotLeft(container)).toBe(50);
  });
});

describe('P823: Calibration slider axis direction — CalibrationBar (via CalibrationDisplay)', () => {
  it('underconfident (gap=0.75) dot is LEFT of center (<50%)', () => {
    const { container } = render(
      <CalibrationDisplay calibration={UNDERCONFIDENT} />
    );
    expect(getCalibrationBarDotLeftPercent(container)).toBeLessThan(50);
  });

  it('overconfident (gap=-0.75) dot is RIGHT of center (>50%)', () => {
    const { container } = render(
      <CalibrationDisplay calibration={OVERCONFIDENT} />
    );
    expect(getCalibrationBarDotLeftPercent(container)).toBeGreaterThan(50);
  });
});
