import { describe, it, expect } from 'vitest';
import { mergeInFlight, PARTNER_OWNED_KEYS } from '@/app/lib/live-state-merge';
import type { LiveSessionState } from '@/app/types';

/**
 * P609/P741: In-flight partner-key preservation regression tests.
 *
 * Tests the mergeInFlight helper that restores P609's partner-key extraction
 * while keeping P671's ratingPhase monotonic guard.
 */

const baseState: LiveSessionState = {
  ratingPhase: 'idle',
  currentRound: 1,
  checkerSubmitted: false,
  responderSubmitted: false,
  explainBackRound: 0,
  explainBackRatings: [],
  explainBackDone: false,
  checksCount: 0,
  freeSliderCreator: 5,
  freeSliderJoiner: 3,
};

const noPhaseRegression = () => false;
const alwaysPhaseRegression = () => true;

describe('P609/P741: mergeInFlight — partner-key preservation', () => {
  it('partner slider update preserved during in-flight write', () => {
    const result = mergeInFlight({
      incoming: { ...baseState, freeSliderJoiner: 7 },
      prev: { ...baseState, freeSliderJoiner: 3 },
      confirmedRef: { ...baseState, freeSliderJoiner: 3 },
      myKey: 'freeSliderCreator',
      myPositionKey: 'livePositionsCreator',
      isPhaseRegression: noPhaseRegression,
    });
    expect(result.nextState.freeSliderJoiner).toBe(7);
    expect(result.nextConfirmedRef.freeSliderJoiner).toBe(7);
  });

  it('partner position update preserved during in-flight write', () => {
    const partnerPositions = { 'point-1': 'agree' as const };
    const result = mergeInFlight({
      incoming: { ...baseState, livePositionsJoiner: partnerPositions },
      prev: { ...baseState },
      confirmedRef: { ...baseState },
      myKey: 'freeSliderCreator',
      myPositionKey: 'livePositionsCreator',
      isPhaseRegression: noPhaseRegression,
    });
    expect(result.nextState.livePositionsJoiner).toEqual(partnerPositions);
    expect(result.nextConfirmedRef.livePositionsJoiner).toEqual(partnerPositions);
  });

  it('multiple rapid partner updates all preserved', () => {
    const result1 = mergeInFlight({
      incoming: { ...baseState, freeSliderJoiner: 5 },
      prev: baseState,
      confirmedRef: baseState,
      myKey: 'freeSliderCreator',
      myPositionKey: 'livePositionsCreator',
      isPhaseRegression: noPhaseRegression,
    });
    const result2 = mergeInFlight({
      incoming: { ...baseState, freeSliderJoiner: 7 },
      prev: result1.nextState,
      confirmedRef: result1.nextConfirmedRef,
      myKey: 'freeSliderCreator',
      myPositionKey: 'livePositionsCreator',
      isPhaseRegression: noPhaseRegression,
    });
    const result3 = mergeInFlight({
      incoming: { ...baseState, freeSliderJoiner: 9 },
      prev: result2.nextState,
      confirmedRef: result2.nextConfirmedRef,
      myKey: 'freeSliderCreator',
      myPositionKey: 'livePositionsCreator',
      isPhaseRegression: noPhaseRegression,
    });
    expect(result3.nextConfirmedRef.freeSliderJoiner).toBe(9);
    expect(result3.nextState.freeSliderJoiner).toBe(9);
  });

  it('echo of my own partner-owned key is not re-applied (local optimistic wins)', () => {
    // I am the creator. An echo of my own freeSliderCreator arrives from server.
    // My local optimistic value (9) must win over the echoed server value (8).
    const result = mergeInFlight({
      incoming: { ...baseState, freeSliderCreator: 8 },
      prev: { ...baseState, freeSliderCreator: 9 },
      confirmedRef: { ...baseState, freeSliderCreator: 9 },
      myKey: 'freeSliderCreator',
      myPositionKey: 'livePositionsCreator',
      isPhaseRegression: noPhaseRegression,
    });
    // freeSliderCreator is myKey — excluded from partnerUpdates, so prev wins.
    expect(result.nextState.freeSliderCreator).toBe(9);
    expect(result.nextConfirmedRef.freeSliderCreator).toBe(9);
  });

  // P671 guard: ratingPhase monotonic — these two cases prevent regressions of P671.

  it('ratingPhase advances when server is ahead (P671 guard)', () => {
    const result = mergeInFlight({
      incoming: { ...baseState, ratingPhase: 'revealed' },
      prev: { ...baseState, ratingPhase: 'waiting' },
      confirmedRef: { ...baseState, ratingPhase: 'waiting' },
      myKey: 'freeSliderCreator',
      myPositionKey: 'livePositionsCreator',
      isPhaseRegression: alwaysPhaseRegression,  // server 'revealed' > local 'waiting'
    });
    expect(result.nextState.ratingPhase).toBe('revealed');
    expect(result.nextConfirmedRef.ratingPhase).toBe('revealed');
  });

  it('ratingPhase held when server is behind (P671 guard)', () => {
    const result = mergeInFlight({
      incoming: { ...baseState, ratingPhase: 'waiting' },
      prev: { ...baseState, ratingPhase: 'revealed' },
      confirmedRef: { ...baseState, ratingPhase: 'revealed' },
      myKey: 'freeSliderCreator',
      myPositionKey: 'livePositionsCreator',
      isPhaseRegression: noPhaseRegression,  // server 'waiting' < local 'revealed' — no advancement
    });
    expect(result.nextState.ratingPhase).toBe('revealed');
    expect(result.nextConfirmedRef.ratingPhase).toBe('revealed');
  });

  it('PARTNER_OWNED_KEYS covers expected fields', () => {
    expect(PARTNER_OWNED_KEYS).toContain('freeSliderCreator');
    expect(PARTNER_OWNED_KEYS).toContain('freeSliderJoiner');
    expect(PARTNER_OWNED_KEYS).toContain('livePositionsCreator');
    expect(PARTNER_OWNED_KEYS).toContain('livePositionsJoiner');
  });
});
