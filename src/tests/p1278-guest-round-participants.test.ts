import { describe, it, expect } from 'vitest';
import { resolveVerificationParticipants } from '@/app/data/live-verification-participants';

const CREATOR = 'creator-profile-id';
const JOINER = 'joiner-profile-id';

describe('P1278 D — who a /live calibration row names', () => {
  it('two signed-in participants: both named, whichever of them writes (unchanged behaviour)', () => {
    const session = { creatorName: 'Ann', creatorProfileId: CREATOR, joinerProfileId: JOINER };
    expect(resolveVerificationParticipants(session, 'Ann', CREATOR)).toEqual({ speakerId: CREATOR, listenerId: JOINER });
    expect(resolveVerificationParticipants(session, 'Bo', JOINER)).toEqual({ speakerId: JOINER, listenerId: CREATOR });
  });

  it('a guest in the joiner seat: the creator records the round with the guest side null, in either role', () => {
    const session = { creatorName: 'Ann', creatorProfileId: CREATOR, joinerProfileId: null };
    expect(resolveVerificationParticipants(session, 'Ann', CREATOR)).toEqual({ speakerId: CREATOR, listenerId: null });
    expect(resolveVerificationParticipants(session, 'Guest Gil', CREATOR)).toEqual({ speakerId: null, listenerId: CREATOR });
  });

  it('a guest room written by anyone but the creator is not recorded', () => {
    const session = { creatorName: 'Ann', creatorProfileId: CREATOR, joinerProfileId: undefined };
    expect(resolveVerificationParticipants(session, 'Ann', 'someone-else')).toBeNull();
  });

  it('a room with no creator profile is not recorded, even by a signed-in writer', () => {
    const session = { creatorName: 'Ann', creatorProfileId: null, joinerProfileId: JOINER };
    expect(resolveVerificationParticipants(session, 'Ann', JOINER)).toBeNull();
    expect(resolveVerificationParticipants(session, 'Bo', JOINER)).toBeNull();
  });

  it('a guest round in an ended room is not recorded — the database would refuse it', () => {
    const session = { creatorName: 'Ann', creatorProfileId: CREATOR, joinerProfileId: null, endedAt: '2026-09-11T10:00:00Z' };
    expect(resolveVerificationParticipants(session, 'Ann', CREATOR)).toBeNull();
  });

  it('never names the same profile on both sides', () => {
    const session = { creatorName: 'Ann', creatorProfileId: CREATOR, joinerProfileId: null };
    for (const checker of ['Ann', 'Gil']) {
      const r = resolveVerificationParticipants(session, checker, CREATOR);
      expect(r).not.toBeNull();
      expect(r!.speakerId).not.toEqual(r!.listenerId);
    }
  });
});
