import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FreeModeSuccess } from '../app/components/partners/free-mode-success';

/**
 * P810: Celebration journey table must render actual stored slider values.
 *
 * Bug: The final row was synthesized as hard-coded 10/10 regardless of stored state.
 * Fix: FreeModeSuccess accepts finalListenerConfidence/finalSpeakerBelief props
 *      computed from liveState.freeSliderCreator/Joiner at the call site.
 */

const baseProps = {
  partnerName: 'Alex',
  isChecker: false,
  rounds: [],
  onContinue: () => {},
  isWaiting: false,
};

describe('P810: FreeModeSuccess final row renders actual stored slider values', () => {
  it('asymmetric state (listener=6, speaker=10) renders 6 in listener position', () => {
    render(
      <FreeModeSuccess
        {...baseProps}
        finalListenerConfidence={6}
        finalSpeakerBelief={10}
      />
    );

    expect(screen.getByTestId('final-listener-value').textContent).toBe('6');
    expect(screen.getByTestId('final-speaker-value').textContent).toBe('10');
  });

  it('asymmetric state (listener=10, speaker=4) renders 4 in speaker position', () => {
    render(
      <FreeModeSuccess
        {...baseProps}
        finalListenerConfidence={10}
        finalSpeakerBelief={4}
      />
    );

    expect(screen.getByTestId('final-listener-value').textContent).toBe('10');
    expect(screen.getByTestId('final-speaker-value').textContent).toBe('4');
  });

  it('symmetric state (10/10) renders both as 10', () => {
    render(
      <FreeModeSuccess
        {...baseProps}
        finalListenerConfidence={10}
        finalSpeakerBelief={10}
      />
    );

    expect(screen.getByTestId('final-listener-value').textContent).toBe('10');
    expect(screen.getByTestId('final-speaker-value').textContent).toBe('10');
  });

  it('isChecker=true role flip: labels switch but values still come from props', () => {
    render(
      <FreeModeSuccess
        {...baseProps}
        isChecker={true}
        finalListenerConfidence={8}
        finalSpeakerBelief={5}
      />
    );

    // Values from props regardless of role
    expect(screen.getByTestId('final-listener-value').textContent).toBe('8');
    expect(screen.getByTestId('final-speaker-value').textContent).toBe('5');
    // Labels switch: checker's partner is the listener
    expect(screen.getByTestId('final-listener-label').textContent).toContain("Alex's confidence");
    expect(screen.getByTestId('final-speaker-label').textContent).toContain('Your belief');
  });
});
