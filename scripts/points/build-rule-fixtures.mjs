#!/usr/bin/env node
/**
 * build-rule-fixtures.mjs — regenerate the DW-6 / DW-7 / DW-9 / DW-11 / DW-14
 * must-fail fixtures for `rule-present.mjs`.
 *
 * Each fixture is DERIVED from the real file: every rule's own sentence,
 * verbatim, EXCEPT one, which is deleted so the predicate is watched to REJECT
 * (epistemic.md gate 7). Not a predicate itself — a fixture builder. Run it
 * from the repo root after editing any rule sentence.
 */

import { RULE_SETS } from './rule-present.mjs'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const STRIP = {
  'one-gate': 'downstream may sharpen an approved axis',
  'transcript-first': 'no counterpart video search runs before that',
  'standing-rules': 'one video per person per event',
  'story-unit': 'single-point scope judged by a checker that is not the writer',
  'same-vote': '"re-cast" means fresh Gates 1–2, a fresh seal, a new run',
  'event-contract': 'each point gets its own stake and re-stake, not one aggregate up front',
  'page-shape': '/meet linked once, plain',
}
/**
 * P1358. Some rules require a sentence to be ABSENT, and a fixture with a line
 * DELETED cannot watch such a rule fail — the defect is the sentence coming BACK.
 * So for these sets the fixture keeps every rule line and RESTORES the banned
 * sentence, verbatim as positions.md carried it until 2026-09-28. That is the
 * mutation-of-the-real-content control epistemic.md gate 7d asks for: the sentence
 * is the one that actually shipped, not an invented stand-in.
 *
 * It is written WITHOUT a leading `>` on purpose — the banned pattern ignores
 * blockquotes, because the file legitimately quotes its own history.
 */
const ADD = {
  'speaker-confirmation': {
    file: 'positions.md',
    line: 'Skip entirely for `single-speaker` and `speaker-labelled` sources. For every quote from a `turn-verified` source, do this **per quote** and record the result.',
  },
}
for (const [name, set] of Object.entries(RULE_SETS)) {
  const dir = path.join('src/tests/fixtures/p1210/rules', name)
  mkdirSync(dir, { recursive: true })
  for (const [loc, rules] of Object.entries(set.locations)) {
    const lines = readFileSync(loc, 'utf8').split('\n')
    const out = [
      `<!-- MUST-FAIL FIXTURE for P1210 ${set.dw} (${name}) — GENERATED, do not hand-edit. -->`,
      `<!-- Derived from ${loc}: each rule's own sentence, verbatim, EXCEPT the one named below, -->`,
      `<!-- which is deleted so the predicate is watched to REJECT (epistemic.md gate 7). -->`,
      // NB: the deleted rule is NOT named here. An earlier version wrote its label
      // into this header and the predicate then matched its own strip note, so every
      // must-fail fixture came back RESOLVE — the control was blind while looking green.
      `<!-- one rule sentence has been deleted; see STRIP in scripts/points/build-rule-fixtures.mjs -->`,
      '',
    ]
    let deleted = false
    for (const [label, re, opts] of rules) {
      if (label === STRIP[name]) { deleted = true; continue }
      // An absent-rule has no line to copy: its regex matches nothing in a correct
      // file, which is the point. The ADD below is what makes it fire.
      if (opts?.absent) continue
      const hit = lines.find(l => re.test(l))
      if (!hit) throw new Error(`no line matches "${label}" in ${loc}`)
      out.push(hit, '')
    }
    let added = false
    if (ADD[name] && path.basename(loc) === ADD[name].file) { out.push(ADD[name].line, ''); added = true }
    writeFileSync(path.join(dir, path.basename(loc)), out.join('\n'))
    if (deleted) console.log(`  ${name}/${path.basename(loc)}: deleted "${STRIP[name]}"`)
    else if (added) console.log(`  ${name}/${path.basename(loc)}: restored the BANNED sentence, so the absent-rule must REJECT`)
    else console.log(`  ${name}/${path.basename(loc)}: all rules kept (the strip is in another file of this set)`)
  }
}
