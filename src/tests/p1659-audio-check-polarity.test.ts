/**
 * P1659 — the polarity guard must catch an inversion in EITHER direction, judged
 * against the audio the quote actually matched, and must not reject a faithful
 * quote over contraction vs expansion.
 *
 * Every case here was a wrong verdict on main c6dd21917 (P1638 triage, 2026-11-10).
 */
import { afterAll, describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { run, FIXTURES } from '../../scripts/points/audio-check.mjs'

describe('P1659: polarity guard is symmetric and window-scoped', () => {
  it('a quote that DROPS a negation the speaker said is REJECTed', () => {
    const r = run({ quote: 'the systems are open weights', asr: 'the systems are not open weights' })
    expect(r.verdict).toBe('REJECT')
    expect(r.detail).toMatch(/not/)
  })

  it('a polarity word elsewhere in the audio does not satisfy the guard for this sentence', () => {
    const r = run({
      quote: "the most dangerous is when the systems are proprietary weights because there's basically no defense",
      asr: FIXTURES.pass.asr,
    })
    expect(r.verdict).toBe('REJECT')
    expect(r.detail).toMatch(/polarity guard FAILED/)
  })

  it("an unlisted negative contraction (aren't) is still a polarity word", () => {
    const r = run({ quote: "the systems aren't safe", asr: 'the systems are safe' })
    expect(r.verdict).toBe('REJECT')
  })

  it('contraction vs expansion of the same negation is a faithful quote', () => {
    expect(run({ quote: "we can't do this", asr: 'we cannot do this' }).verdict).toBe('CONFIRM')
    expect(run({ quote: 'we do not agree', asr: "we don't agree" }).verdict).toBe('CONFIRM')
  })

  it('the existing control set keeps its verdicts', () => {
    expect(run(FIXTURES.pass).verdict).toBe('CONFIRM')
    expect(run(FIXTURES.nearMiss).verdict).toBe('REJECT')
    expect(run(FIXTURES.fail).verdict).toBe('REJECT')
  })

  it('the control set includes a dropped-negation near-miss, and the guard (not the ratio) rejects it', () => {
    const r = run(FIXTURES.nearMissDropped)
    expect(r.verdict).toBe('REJECT')
    expect(r.ratio).toBeGreaterThanOrEqual(0.75)
    expect(r.extraPolarity).toContain('not')
  })

  it('a dropped negation is reported as audio-only polarity, not as missing', () => {
    const r = run({ quote: 'the systems are open weights', asr: 'the systems are not open weights' })
    expect(r.extraPolarity).toContain('not')
    expect(r.missingPolarity).toEqual([])
  })

  it("shouldn't and should not are the same claim", () => {
    expect(run({ quote: "we shouldn't do this", asr: 'we should not do this' }).verdict).toBe('CONFIRM')
  })

  it('a repeated polarity word in the audio is still one claim', () => {
    expect(run({ quote: 'there is no defense', asr: 'no, no, there is no defense' }).verdict).toBe('CONFIRM')
  })

  it('the existing near-miss still names exactly what the quote asserts', () => {
    expect(run(FIXTURES.nearMiss).missingPolarity).toEqual(['closed', 'total'])
  })

  // Review round 1 (Gemini, Codex, criteria review): each was a CONFIRM on an inversion.
  it('a negation at the edge of the spoken span is not trimmed away', () => {
    expect(run({ quote: 'we support this plan', asr: 'we do not support this plan' }).verdict).toBe('REJECT')
    expect(run({ quote: 'we support the bill', asr: 'we do not support the bill' }).verdict).toBe('REJECT')
  })

  it('a negator just before the quoted span is read', () => {
    expect(run({ quote: 'good plan', asr: 'it is not a good plan' }).verdict).toBe('REJECT')
    expect(run({ quote: 'the systems are safe', asr: 'not that the systems are safe' }).verdict).toBe('REJECT')
  })

  it("dropping the second of two negations is caught (sets would hide it)", () => {
    const r = run({ quote: 'we do not support taxes and support grants', asr: 'we do not support taxes and do not support grants' })
    expect(r.verdict).toBe('REJECT')
  })

  it("rarer contractions are negations too (mightn't, oughtn't with a curly apostrophe)", () => {
    expect(run({ quote: "we mightn't release the weights", asr: 'we might release the weights' }).verdict).toBe('REJECT')
    expect(run({ quote: 'we ought to do this', asr: 'we oughtn\u2019t to do this' }).verdict).toBe('REJECT')
  })

  it('"no" and "not" are the same negation', () => {
    expect(run({ quote: 'this is not good', asr: 'this is no good' }).verdict).toBe('CONFIRM')
  })

  it("ain't matches its expanded form whatever the auxiliary", () => {
    expect(run({ quote: "I ain't going", asr: 'I am not going' }).verdict).toBe('CONFIRM')
  })

  it("a negation in the NEXT clause does not reject a faithful quote", () => {
    expect(run({ quote: 'the systems are open weights', asr: 'the systems are open weights and we cannot trust them' }).verdict).toBe('CONFIRM')
  })

  it('a long transcript stays fast (one DP per start, not per length)', () => {
    const asr = Array.from({ length: 20000 }, (_, i) => 'w' + (i % 97)).join(' ')
    const quote = Array.from({ length: 60 }, (_, i) => 'w' + ((i * 7) % 97)).join(' ')
    const t = Date.now()
    run({ quote, asr })
    expect(Date.now() - t).toBeLessThan(5000)
  })

  // Review round 2 (Gemini, Codex, criteria review). Each row was a wrong verdict
  // on the round-2 code, and each must hold from here on.
  it.each([
    ['it is a good plan', 'I do not believe that it is a good plan', 'REJECT'],
    ['is a good plan', "I don't think this is a good plan", 'REJECT'],
    ['good plan', 'it is not at all a good plan', 'REJECT'],
    ['we should go', 'we do not know whether we should go', 'REJECT'],
    ['the model is safe when we do not rush', 'it is not that the model is safe when we do not rush', 'REJECT'],
    ['these systems are safe to deploy', 'none of these systems are safe to deploy', 'REJECT'],
    ['we should let somebody access the system', 'we should let nobody access the system', 'REJECT'],
    ['we should use either option', 'we should use neither option', 'REJECT'],
    ['the systems uh um are open weights and available for download', 'the systems are open weights and available for download not proprietary', 'CONFIRM'],
    ['we really agree today', 'No. We agree today.', 'CONFIRM'],
    // Round 3: a negated clause beside an affirmative one must not reject the affirmative quote...
    ['I think the systems are safe to deploy', "I don't know about the politics, but I think the systems are safe to deploy", 'CONFIRM'],
    ['the model is completely safe to use', "Look, I'm not a lawyer, the model is completely safe to use", 'CONFIRM'],
    ['there is a clear path forward for us', 'Yeah, no, I mean, there is a clear path forward for us', 'CONFIRM'],
    ['it is a good plan', 'I was not sure at first but it is a good plan', 'CONFIRM'],
    ['we won', 'nobody expected it and we won', 'CONFIRM'],
    // ...while a negation governing the quoted clause still rejects it.
    ['no doubt this is a safe system', 'I do not think there is no doubt this is a safe system', 'REJECT'],
    ['Smith is ready to lead the team', 'I do not think Dr. Smith is ready to lead the team', 'REJECT'],
    ['the systems are safe', 'the systems are hardly safe', 'REJECT'],
    ['No one can predict the future', 'Noone can predict the future', 'CONFIRM'],
    ['there is no defense', 'no no there is no defense', 'CONFIRM'],
    // Round 4: "not yet" / "not so" are one negation, not a clause break; dashes and
    // ellipses are breaks; "nor" governs; modal + 've contractions expand.
    ['ready to go', 'we are not yet ready to go', 'REJECT'],
    ['safe', 'this is not so safe', 'REJECT'],
    ['the economy is growing', 'the economy is not so much growing as shrinking', 'REJECT'],
    ['the model is completely safe to use', 'I am not a lawyer -- the model is completely safe to use', 'CONFIRM'],
    ['the model is completely safe to use', 'I am not a lawyer \u2014 the model is completely safe to use', 'CONFIRM'],
    ['the model is completely safe to use', 'I do not know\u2026 the model is completely safe to use', 'CONFIRM'],
    ['the model is safe to deploy', 'I do not trust their benchmarks. Nor do I think the model is safe to deploy.', 'REJECT'],
    ['we would have released the model without testing it first', "we wouldn't've released the model without testing it first", 'REJECT'],
    ["we should've done this years ago", 'we should have done this years ago', 'CONFIRM'],
    ['it is a good plan', 'I do not think - it is a good plan', 'CONFIRM'],
    // Round 5: a typographic closing quote after the period still ends the sentence.
    ['the model is safe to deploy', 'He said \u201CI do not agree.\u201D The model is safe to deploy.', 'CONFIRM'],
  ])('%s  <-  %s  =>  %s', (quote, asr, want) => {
    expect(run({ quote, asr }).verdict).toBe(want)
  })

  it('empty quote and empty ASR still REFUSE', () => {
    expect(run({ quote: '', asr: 'some words' }).verdict).toBe('REFUSE')
    expect(run({ quote: 'some words', asr: '' }).verdict).toBe('REFUSE')
  })
})

describe('P1659: the CLI runs from any path', () => {
  const SRC = resolve(__dirname, '../../scripts/points/audio-check.mjs')
  const roots: string[] = []
  afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }) })
  const spaced = () => {
    const root = mkdtempSync(join(tmpdir(), 'p1659-'))
    roots.push(root)
    const dir = join(root, 'dir with space')
    mkdirSync(dir)
    const copy = join(dir, 'audio-check.mjs')
    copyFileSync(SRC, copy)
    return { dir, copy }
  }

  it('--controls runs from a directory whose name contains a space', () => {
    const { copy } = spaced()
    const out = spawnSync(process.execPath, [copy, '--controls'], { encoding: 'utf8' })
    expect(out.stdout).toMatch(/CONTROL SET: all \d+ correct/)
    expect(out.status).toBe(0)
  })

  it('--controls and file mode run through a symlink', () => {
    const { dir, copy } = spaced()
    const link = join(dir, 'link.mjs')
    symlinkSync(copy, link)
    const out = spawnSync(process.execPath, [link, '--controls'], { encoding: 'utf8' })
    expect(out.stdout).toMatch(/CONTROL SET: all \d+ correct/)
    expect(out.status).toBe(0)
    const check = join(dir, 'check.json')
    writeFileSync(check, JSON.stringify({ quote: 'we do not agree', asr: "we don't agree" }))
    const file = spawnSync(process.execPath, [link, check], { encoding: 'utf8' })
    expect(file.stdout).toMatch(/^CONFIRM/)
    expect(file.status).toBe(0)
  })

  it('an unreadable check file exits 2, never 1 (which reads as a REJECT)', () => {
    const { dir, copy } = spaced()
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{not json')
    const out = spawnSync(process.execPath, [copy, bad], { encoding: 'utf8' })
    expect(out.status).toBe(2)
    expect(spawnSync(process.execPath, [copy, join(dir, 'missing.json')], { encoding: 'utf8' }).status).toBe(2)
  })

  it('a REFUSE (empty transcription) and a non-object check file exit 2, not 1', () => {
    const { dir, copy } = spaced()
    const refuse = join(dir, 'refuse.json')
    const nul = join(dir, 'null.json')
    writeFileSync(refuse, JSON.stringify({ quote: 'some words', asr: '' }))
    writeFileSync(nul, 'null')
    const r = spawnSync(process.execPath, [copy, refuse], { encoding: 'utf8' })
    expect(r.stdout).toMatch(/^REFUSE/)
    expect(r.status).toBe(2)
    expect(spawnSync(process.execPath, [copy, nul], { encoding: 'utf8' }).status).toBe(2)
  })

  it('file mode runs from a spaced path and returns the verdict as its exit code', () => {
    const { dir, copy } = spaced()
    const good = join(dir, 'good.json')
    const bad = join(dir, 'bad.json')
    writeFileSync(good, JSON.stringify({ quote: 'we do not agree', asr: "we don't agree" }))
    writeFileSync(bad, JSON.stringify({ quote: 'the systems are open weights', asr: 'the systems are not open weights' }))
    const ok = spawnSync(process.execPath, [copy, good], { encoding: 'utf8' })
    const no = spawnSync(process.execPath, [copy, bad], { encoding: 'utf8' })
    expect(ok.stdout).toMatch(/^CONFIRM/)
    expect(ok.status).toBe(0)
    expect(no.stdout).toMatch(/^REJECT/)
    expect(no.status).toBe(1)
  })

  it('--controls exits 1 when the dropped-negation control stops discriminating', () => {
    const { copy } = spaced()
    // Make the dropped-negation near-miss a faithful quote: the control set must notice.
    const src = readFileSync(copy, 'utf8').replace(
      `quote: "the most dangerous is when the systems are open weights because there's basically defense."`,
      `quote: "the most dangerous is when the systems are open weights because there's basically no defense."`,
    )
    expect(src).toContain('basically no defense."')
    writeFileSync(copy, src)
    const out = spawnSync(process.execPath, [copy, '--controls'], { encoding: 'utf8' })
    expect(out.stdout).toMatch(/HARNESS FAILURE/)
    expect(out.status).toBe(1)
  })
})
