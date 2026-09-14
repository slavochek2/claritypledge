/**
 * @file p1278-guest-round-recorded-by-creator.test.ts
 * @description P1278 D — when a guest submits a round's last rating, the creator's client records it.
 *
 * The behavioural proof is the real two-browser round (e2e/p1278-real-browser-round.spec.ts, arm B):
 * before this change the round completed and zero rows landed. These pin the decision itself —
 * including every case where the creator's client must NOT write, because a second writer for the same
 * round double-counts it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { guestRoundToRecord, type ObservedLiveRound } from '@/app/data/live-guest-round';

const revealed: ObservedLiveRound = {
  checksCount: 1,
  ratingPhase: 'revealed',
  checkerName: 'Ada',
  checkerSubmitted: true,
  responderSubmitted: true,
  checkerRating: 7,
  responderRating: 8,
  selectedStoryId: null,
};

const guestRoom = { isCreator: true, joinerProfileId: null, endedAt: null, previousChecksCount: 0 };

describe('P1278 D: the creator records a guest round the guest completed', () => {
  it('records the round, keyed on its pre-completion count (the submit path\'s key)', () => {
    expect(guestRoundToRecord({ ...guestRoom, state: revealed })).toEqual({
      storyId: undefined,
      checkerName: 'Ada',
      checkerRating: 7,
      responderRating: 8,
      exchangeIndex: 0,
    });
  });

  it('carries the selected story', () => {
    expect(guestRoundToRecord({ ...guestRoom, state: { ...revealed, selectedStoryId: 's1' } })?.storyId).toBe('s1');
  });

  it('records nothing on a first observation — a reload onto an already-revealed round', () => {
    expect(guestRoundToRecord({ ...guestRoom, previousChecksCount: null, state: revealed })).toBeNull();
  });

  it('records nothing when the count did not advance while this client watched', () => {
    expect(guestRoundToRecord({ ...guestRoom, previousChecksCount: 1, state: revealed })).toBeNull();
  });

  it('records nothing for the explain-back step, which advances the count with the same ratings in state', () => {
    expect(guestRoundToRecord({ ...guestRoom, previousChecksCount: 1, state: { ...revealed, checksCount: 2, ratingPhase: 'results' } })).toBeNull();
  });

  it('records nothing for a signed-in joiner — that pair\'s second submitter writes the row itself', () => {
    expect(guestRoundToRecord({ ...guestRoom, joinerProfileId: 'joiner-uuid', state: revealed })).toBeNull();
  });

  it('records nothing from the guest\'s own client', () => {
    expect(guestRoundToRecord({ ...guestRoom, isCreator: false, state: revealed })).toBeNull();
  });

  it('records nothing in an ended room', () => {
    expect(guestRoundToRecord({ ...guestRoom, endedAt: '2026-09-11T10:00:00Z', state: revealed })).toBeNull();
  });

  it('records nothing until both ratings are in', () => {
    expect(guestRoundToRecord({ ...guestRoom, state: { ...revealed, responderSubmitted: false } })).toBeNull();
    expect(guestRoundToRecord({ ...guestRoom, state: { ...revealed, responderRating: undefined } })).toBeNull();
    expect(guestRoundToRecord({ ...guestRoom, state: { ...revealed, checkerName: undefined } })).toBeNull();
  });
});

describe('P1278 D: the live page wires that decision to the write', () => {
  const source = readFileSync(resolve(__dirname, '../app/pages/clarity-live-page.tsx'), 'utf8');

  it('asks guestRoundToRecord and writes the round it returns', () => {
    expect(source).toContain("from '@/app/data/live-guest-round'");
    const asked = source.match(/guestRoundToRecord\(\{/g) ?? [];
    expect(asked).toHaveLength(1);
    expect(source).toContain('void writeVerification({ ...round, sessionId: session.id });');
  });

  it('baselines from the session row, so a reload onto a revealed round writes nothing', () => {
    expect(source).toContain('(session.liveState as LiveSessionState | null | undefined)?.checksCount ?? 0');
  });
});

describe('P1278 D: the round is claimed only by a client that can write it', () => {
  const source = readFileSync(resolve(__dirname, '../app/pages/clarity-live-page.tsx'), 'utf8');

  it('claims the round key after the writer guard, not before it', () => {
    const guard = source.indexOf('if (!user?.id || !session) return;');
    const claim = source.indexOf('verificationFiredRef.current.add(roundKey);');
    expect(guard).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(guard);
  });

  it('releases the round when the write throws, so a blip does not lose it permanently', () => {
    expect(source).toContain('verificationFiredRef.current.delete(roundKey);');
  });

  it('passes the room\'s record of who asked to both write paths', () => {
    expect(source).toContain('checkerIsCreator: currentState.checkerIsCreator,');
    expect(source).toContain('resolveVerificationParticipants(session, checkerName, user.id, checkerIsCreator)');
  });
});

describe('P1278 D: the watcher carries who asked into the write', () => {
  it('includes checkerIsCreator from the observed round', () => {
    const round = guestRoundToRecord({
      isCreator: true,
      joinerProfileId: null,
      endedAt: null,
      previousChecksCount: 0,
      state: { ...revealed, checkerIsCreator: false },
    });
    expect(round?.checkerIsCreator).toBe(false);
  });
});
