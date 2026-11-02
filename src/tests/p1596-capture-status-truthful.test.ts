/**
 * P1596 (review): the status line never claims words are being recorded when the audio tap is down, and says once
 * that audio could not be saved.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const ctxMock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => ctxMock.value }));

import { useCaptureStatus } from '@/app/components/session/capture-status';

const base = { phase: 'capturing', manualPaused: false, inputSilent: false, micLost: false, micSwitched: false, stopping: false, tapDown: false, audioLost: false };
const status = (over: Record<string, unknown>) => { ctxMock.value = { ...base, ...over }; return renderHook(() => useCaptureStatus()).result.current; };

describe('useCaptureStatus, recorder truth', () => {
  it('names a dead recorder ahead of a stall, and does not say words are still being recorded', () => {
    const s = status({ phase: 'stalled', tapDown: true });
    expect(s.kind).toBe('notRecording');
    expect(s.warn).toBe(true);
    expect(s.text).toMatch(/not recording/i);
    expect(s.text).not.toMatch(/still being recorded/i);
  });

  it('a stall with the recorder running still says the words are being recorded', () => {
    expect(status({ phase: 'stalled' }).text).toMatch(/still being recorded/i);
  });

  it('says part of the audio was not saved while recording goes on', () => {
    const s = status({ audioLost: true });
    expect(s.kind).toBe('audioLost');
    expect(s.warn).toBe(true);
  });

  it('a dead microphone and a stopped bar keep their own lines ahead of the notice', () => {
    expect(status({ micLost: true, audioLost: true }).kind).toBe('micLost');
    expect(status({ stopping: true, audioLost: true }).kind).toBe('stopping');
  });
});
