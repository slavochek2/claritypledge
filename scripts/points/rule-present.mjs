#!/usr/bin/env node
/**
 * rule-present.mjs — P1210 §12 / DW-6, DW-7, DW-9, DW-11, DW-14.
 *
 * SCOPE, STATED SO NOTHING CAN READ MORE INTO IT. This asserts that a rule EXISTS
 * and is correctly stated AT A NAMED LOCATION. It does NOT assert that an agent
 * obeys it. The pipeline is markdown with zero executables; ordering rules, gate
 * placement, the sharpen-not-add rule and the separate-checker requirement are
 * instructions to a reader, and no test can observe a reader. §12 says exactly
 * this and these rows claim nothing more.
 *
 * Every rule set carries a must-fail fixture: the same file with the sentence
 * removed, which must be REJECTED (epistemic.md gate 7).
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const id = 'rule-present'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '..', '..')
const SKILLS = '.claude/commands/slava/disagreement'
const FIXTURES_DIR = 'src/tests/fixtures/p1210/rules'

/**
 * Each rule is a label plus a regex that must match somewhere in the file.
 * The regexes are deliberately anchored on the load-bearing words, so that
 * deleting the sentence — the must-fail fixture — breaks the match.
 */
export const RULE_SETS = {
  'one-gate': {
    dw: 'DW-6',
    locations: {
      [`${SKILLS}/select.md`]: [
        ['candidate points proposed beside the cast', /candidate points?[^.\n]*beside the cast|beside the cast[^.\n]*candidate points?/i],
        ['the founder approves cast and points at ONE gate', /one gate[^.\n]*cast and points|cast and points[^.\n]*one gate/i],
      ],
      [`${SKILLS}/prepare.md`]: [
        ['downstream may sharpen an approved axis', /may \*\*sharpen\*\*|may sharpen[^.\n]*approved axis/i],
        ['downstream may not add a new axis', /may \*\*not\*\* add a new axis|may not add a new axis/i],
        ['a genuinely new fork returns to the founder', /genuinely new fork[^.\n]*returns to the founder/i],
      ],
    },
  },
  'transcript-first': {
    dw: 'DW-7',
    locations: {
      [`${SKILLS}/select.md`]: [
        ["person one's transcript is read first", /transcript[- ]first|read person one's transcript first/i],
        ['2–3 counterpart candidates are named with the sentence each would produce', /2[–-]3 counterpart candidates[^.\n]*contradiction sentence/i],
        ['no counterpart video search runs before that', /no counterpart video search runs before/i],
      ],
    },
  },
  'story-unit': {
    dw: 'DW-9',
    locations: {
      [`${SKILLS}/story-draft.md`]: [
        ['one story per (person, point)', /one story per \(person, point\)/i],
        ['no character ceiling', /no character ceiling/i],
        ['single-point scope judged by a checker that is not the writer', /checker that is not the writer/i],
      ],
    },
  },
  'same-vote': {
    dw: 'DW-14',
    locations: {
      [`${SKILLS}/positions.md`]: [
        ['the same-vote flag still offers a three-way choice', /three-way|three way/i],
        ['"re-cast" means fresh Gates 1–2, a fresh seal, a new run', /re-cast[^.]*fresh Gates 1[–-]2[^.]*fresh seal|fresh Gates 1[–-]2[^.]*fresh seal[^.]*new run/i],
      ],
    },
  },
  'event-contract': {
    dw: 'DW-11',
    locations: {
      // DW-11 is a REGRESSION GUARD (RD-8): these sentences were already in the
      // doc when the contract was pinned (commits 0f1fdf7c / 694f9e97). The row
      // earns its place by going red if a later edit removes one of them, so the
      // patterns are anchored on the doc's own wording rather than on a paraphrase.
      'docs/events/clarity-practice-event.md': [
        ['stories are pre-read, not read in the room', /\*\*Stories are pre-read/i],
        ['each point gets its own stake and re-stake, not one aggregate up front', /each point gets its own stake and re-stake/i],
        ['the point statement is stakeable on its own, read aloud in one sentence', /stakeable on its own, read aloud in one sentence/i],
      ],
    },
  },
}

/**
 * @param {{ruleSet: string, files?: Record<string,string>, root?: string}} input
 *   `files` overrides a location with another path — that is how the must-fail
 *   fixture (the same file with the sentence removed) runs the identical code.
 */
export function run(input) {
  const set = RULE_SETS[input.ruleSet]
  if (!set) throw new Error(`rule-present: unknown rule set "${input.ruleSet}"`)
  const root = input.root ?? REPO_ROOT
  const missing = []
  const found = []
  for (const [loc, rules] of Object.entries(set.locations)) {
    const file = input.files?.[loc] ?? path.join(root, loc)
    if (!existsSync(file)) { missing.push(`${loc}: file not found at ${file}`); continue }
    const text = readFileSync(file, 'utf8')
    for (const [label, re] of rules) {
      if (re.test(text)) found.push(`${loc}: ${label}`)
      else missing.push(`${loc}: MISSING — ${label}`)
    }
  }
  if (missing.length) {
    return {
      ok: false, verdict: 'REJECT', missing, found,
      detail: `${set.dw} ${input.ruleSet}: REJECT — ${missing.length} rule(s) absent\n` + missing.map(m => `    ${m}`).join('\n'),
    }
  }
  return {
    ok: true, verdict: 'RESOLVE', missing, found,
    detail: `${set.dw} ${input.ruleSet}: RESOLVE — ${found.length} rule(s) present at their named locations`,
  }
}

/** The must-fail fixture for a rule set: the stripped copy under FIXTURES_DIR. */
export function strippedFixture(ruleSet) {
  const set = RULE_SETS[ruleSet]
  const files = {}
  for (const loc of Object.keys(set.locations)) {
    files[loc] = path.join(REPO_ROOT, FIXTURES_DIR, ruleSet, path.basename(loc))
  }
  return { ruleSet, files }
}

export const FIXTURES = {
  pass: { ruleSet: 'one-gate' },
  fail: strippedFixture('one-gate'),
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sets = process.argv.slice(2)
  const names = sets.length ? sets : Object.keys(RULE_SETS)
  let bad = 0
  for (const name of names) {
    const r = run({ ruleSet: name })
    console.log(r.detail)
    if (!r.ok) bad++
  }
  process.exit(bad ? 1 : 0)
}
