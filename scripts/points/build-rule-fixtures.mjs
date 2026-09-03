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
  'story-unit': 'single-point scope judged by a checker that is not the writer',
  'same-vote': '"re-cast" means fresh Gates 1–2, a fresh seal, a new run',
  'event-contract': 'each point gets its own stake and re-stake, not one aggregate up front',
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
    for (const [label, re] of rules) {
      if (label === STRIP[name]) { deleted = true; continue }
      const hit = lines.find(l => re.test(l))
      if (!hit) throw new Error(`no line matches "${label}" in ${loc}`)
      out.push(hit, '')
    }
    writeFileSync(path.join(dir, path.basename(loc)), out.join('\n'))
    if (deleted) console.log(`  ${name}/${path.basename(loc)}: deleted "${STRIP[name]}"`)
    else console.log(`  ${name}/${path.basename(loc)}: all rules kept (the strip is in another file of this set)`)
  }
}
