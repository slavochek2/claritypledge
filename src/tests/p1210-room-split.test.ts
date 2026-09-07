import { describe, it, expect } from 'vitest'
import { run, FIXTURES } from '../../scripts/points/room-split.mjs'

const ROOM = 'people interested in AI safety among expats and digital nomads in Chiang Mai'

describe('room-split: the objective is the ROOM, not the arguers', () => {
  it('must-pass fixture is ASSESSED', () => {
    const r = run(FIXTURES.pass)
    expect(r.ok).toBe(true)
    expect(r.verdict).toBe('ASSESSED')
  })

  it('THE ACTUAL FAILURE: a split described only about the arguers is REFUSED', () => {
    const r = run(FIXTURES.fail)
    expect(r.ok).toBe(false)
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/SAME-GROUP/)
    expect(r.detail).toMatch(/UNASSESSED/)
  })

  it('naming the same group on both sides is an arguer split relabelled', () => {
    const r = run({ room: ROOM, points: [{ id: 'P1', room_split: { for_who: 'The Room', against_who: 'the room  ' } }] })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/SAME-GROUP/)
  })

  it('one side named and the other blank is ONE-SIDED, not a pass', () => {
    const r = run({ room: ROOM, points: [{ id: 'P1', room_split: { for_who: 'open-source builders', against_who: '   ' } }] })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/ONE-SIDED/)
    expect(r.detail).toMatch(/against_who/)
  })

  it('no room supplied refuses — "already agree" has nothing to be measured against', () => {
    const r = run({ points: FIXTURES.pass.points })
    expect(r.verdict).toBe('REFUSE')
    expect(r.detail).toMatch(/no room supplied/i)
  })

  it('an empty point list confirms nothing and refuses', () => {
    expect(run({ room: ROOM, points: [] }).verdict).toBe('REFUSE')
  })

  it('every point leaning the same way is a FINDING, never an auto-drop', () => {
    const r = run({
      room: ROOM,
      points: [
        { id: 'P1', room_split: { for_who: 'builders', against_who: 'safety folks', lean: 'leans against' } },
        { id: 'P2', room_split: { for_who: 'nomads', against_who: 'researchers', lean: 'leans against' } },
      ],
    })
    expect(r.ok).toBe(true) // does NOT block
    expect(r.verdict).toBe('ASSESSED-ALL-LOPSIDED')
    expect(r.detail).toMatch(/unmeasured by design/)
  })

  // GATE 7c — the workflows that already exist must still pass this gate.
  it('7c: a single well-formed point does NOT trip the lopsided finding', () => {
    const r = run({ room: ROOM, points: [{ id: 'P1', room_split: { for_who: 'a', against_who: 'b', lean: 'divided' } }] })
    expect(r.verdict).toBe('ASSESSED')
  })

  it('7c: points with no lean recorded still pass once both groups are named', () => {
    const r = run({ room: ROOM, points: [
      { id: 'P1', room_split: { for_who: 'open-weights builders', against_who: 'the safety-interested slice' } },
      { id: 'P2', room_split: { for_who: 'founders', against_who: 'redistribution-sympathetic attendees' } },
    ] })
    expect(r.ok).toBe(true)
    expect(r.verdict).toBe('ASSESSED')
  })
})

describe('room-split: "divided" is not a lean (found 2026-09-07, first real point set)', () => {
  const ROOM2 = 'people interested in AI safety among expats and digital nomads in Chiang Mai'
  const mk = (lean: string) => ({
    room: ROOM2,
    points: [1, 2, 3].map(n => ({
      id: `P${n}`,
      room_split: { for_who: `group-a-${n}`, against_who: `group-b-${n}`, lean },
    })),
  })

  it('7c: every point "divided" is the BEST case and must not trip the lopsided finding', () => {
    // It did. Five points all marked "divided" printed "every point leans the same
    // way ... the evening may not divide at all" — the exact opposite of the data.
    const r = run(mk('divided'))
    expect(r.verdict).toBe('ASSESSED')
    expect(r.detail).not.toMatch(/may not divide at all/)
  })

  it('other neutral spellings are treated the same', () => {
    for (const n of ['split', 'even', 'unknown', 'contested', 'DIVIDED']) {
      expect(run(mk(n)).verdict).toBe('ASSESSED')
    }
  })

  it('a genuine one-directional lean across every point STILL flags', () => {
    const r = run(mk('leans against'))
    expect(r.verdict).toBe('ASSESSED-ALL-LOPSIDED')
    expect(r.detail).toMatch(/leans against/)
  })
})
