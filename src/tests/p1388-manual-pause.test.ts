/**
 * @file p1388-manual-pause.test.ts
 * @description P1388 open question 2, resolved: the automatic pause rule must not undo a
 * manual Pause, and a manual Resume must not override /live or an explain-back.
 */
import { describe, it, expect } from 'vitest';
import { decidePauseTransition, type PauseInputs } from '@/app/contexts/room-capture-core';

const base: PauseInputs = {
  phase: 'capturing', pauseLocation: false, explainBackHolds: 0, liveSessionActive: false, manualPaused: false,
};

describe('P1388: decidePauseTransition', () => {
  it('a manual Pause pauses a running capture', () => {
    expect(decidePauseTransition({ ...base, manualPaused: true })).toBe('pause');
    expect(decidePauseTransition({ ...base, phase: 'stalled', manualPaused: true })).toBe('pause');
  });

  it('a manually paused capture is NOT auto-resumed off /live (the bug a naive wiring would ship)', () => {
    expect(decidePauseTransition({ ...base, phase: 'paused', manualPaused: true })).toBeNull();
  });

  it('Resume resumes when nothing else holds the pause', () => {
    expect(decidePauseTransition({ ...base, phase: 'paused', manualPaused: false })).toBe('resume');
  });

  it('Resume does not override /live, an explain-back, or a still-active /live session', () => {
    expect(decidePauseTransition({ ...base, phase: 'paused', pauseLocation: true })).toBeNull();
    expect(decidePauseTransition({ ...base, phase: 'paused', explainBackHolds: 1 })).toBeNull();
    expect(decidePauseTransition({ ...base, phase: 'paused', liveSessionActive: true })).toBeNull();
  });

  it('unchanged P1307 behaviour without a manual pause', () => {
    expect(decidePauseTransition(base)).toBeNull();
    expect(decidePauseTransition({ ...base, pauseLocation: true })).toBe('pause');
    expect(decidePauseTransition({ ...base, phase: 'idle', manualPaused: true })).toBeNull();
    expect(decidePauseTransition({ ...base, phase: 'observing', manualPaused: true })).toBeNull();
  });
});
