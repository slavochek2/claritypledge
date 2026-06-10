/**
 * @file p915-calibration-verdict.test.tsx
 * @description P915: covers BOTH branches of the letter calibration verdict box —
 * calibrated (gap=0, green) and gap (gap>0, blue) — plus badge text + the statement copy.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalibrationVerdict } from '@/app/components/letters/calibration-verdict';

describe('P915 CalibrationVerdict', () => {
  it('gap state: blue box + "N-point gap" badge + pre-commitment statement', () => {
    const { container } = render(<CalibrationVerdict authorName="Maya" authorRating={5} gap={1} />);
    expect(screen.getByText('1-point gap')).toBeInTheDocument();
    expect(screen.getByText(/Before you answered/)).toBeInTheDocument();
    expect(screen.getByText(/estimated you understood their story at a/)).toBeInTheDocument();
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(container.querySelector('.bg-blue-50')).toBeTruthy();
    expect(container.querySelector('.bg-green-50')).toBeNull();
  });

  it('calibrated state: green box + "Perfectly calibrated" badge', () => {
    const { container } = render(<CalibrationVerdict authorName="Maya" authorRating={7} gap={0} />);
    expect(screen.getByText('Perfectly calibrated')).toBeInTheDocument();
    expect(screen.queryByText(/point gap/)).not.toBeInTheDocument();
    expect(container.querySelector('.bg-green-50')).toBeTruthy();
    expect(container.querySelector('.bg-blue-50')).toBeNull();
  });

  it('badge reflects the gap magnitude', () => {
    render(<CalibrationVerdict authorName="Sam" authorRating={3} gap={4} />);
    expect(screen.getByText('4-point gap')).toBeInTheDocument();
  });
});
