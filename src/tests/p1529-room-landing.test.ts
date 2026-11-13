/** P1529 (founder 2026-11-13): where a person who finished the principle lands before round 1. */
import { describe, expect, it } from 'vitest';
import { beforeRoundsStep, pickedStep } from '@/app/prototypes/events/rounds/room-landing';

describe('beforeRoundsStep', () => {
  it('canvas made at the event, no round yet: Canvas', () => {
    expect(beforeRoundsStep({ canvasTab: true, roundsStarted: false })).toBe('canvas');
  });
  it('once a round exists: Table, as before', () => {
    expect(beforeRoundsStep({ canvasTab: true, roundsStarted: true })).toBe('table');
  });
  it('canvas made before the event: Table, as before', () => {
    expect(beforeRoundsStep({ canvasTab: false, roundsStarted: false })).toBe('table');
  });
});

describe('pickedStep', () => {
  it('tapping the current default follows the evening (null), as before', () => {
    expect(pickedStep('table', 'table')).toBeNull();
    expect(pickedStep('principle', 'principle')).toBeNull();
  });
  it('tapping another tab is stored', () => {
    expect(pickedStep('principle', 'canvas')).toBe('principle');
  });
  it('tapping Canvas while it is the default also follows the evening, so round 1 still brings the person to their table', () => {
    expect(pickedStep('canvas', 'canvas')).toBeNull();
  });
});
