#!/usr/bin/env node
/**
 * rule-present.mjs — P1210 §12 / DW-6, DW-7, DW-9, DW-11, DW-14; P1355 standing-rules.
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
  'standing-rules': {
    // P1355. Clarity Night #2 re-asked rules that were already written — at the
    // END of select.md, where nothing made an agent read them before starting.
    // This asserts they sit in one section at the top, that the measurable ones
    // point at their machine source, and that Gate 1's halt carries the P1355
    // wording (videos are screened before Gate 1; approval still precedes audio).
    dw: 'P1355',
    locations: {
      [`${SKILLS}/select.md`]: [
        ['a Standing rules section, read before Phase 0', /^## Standing rules\b[^\n]*before Phase 0/m],
        ['the measurable rules live in standing-rules.json', /numbers live in `scripts\/points\/standing-rules\.json`/],
        // One row per numbered standing rule, anchored on its numbered-list line so a phrase that
        // also appears elsewhere in the file (e.g. "Room constraints" in Inputs) cannot answer for it.
        ['1. English-only sources, translations labelled', /^1\. \*\*English-only sources, for now\*\*/m],
        ['one video per person per event', /^2\. \*\*One video per person per event\.\*\*/m],
        ['3. AI voices are recent', /^3\. \*\*AI voices are recent\*\*/m],
        ['4. floors, exceptions only as overrides inside the seal', /^4\. \*\*Floors on views and comments\*\*/m],
        ['5. minutes on topic, never total length', /^5\. \*\*Minutes on topic, never total length\*\*/m],
        ['6. AI + X: AI voices plus older thinkers', /^6\. \*\*"AI \+ X" topics:\*\*/m],
        ["7. the fork concerns the room's own lives", /^7\. \*\*The fork concerns the room's own lives\*\*/m],
        ['8. lived-experience voices', /^8\. \*\*Lived-experience voices\*\*/m],
        ['9. room constraints never exclude a source', /^9\. \*\*Room constraints\*\*/m],
        ['10. the banner never changes height', /^10\. \*\*The event page's banner never changes height\*\*/m],
        ['Gate 1 halts before any source is approved or fetched as audio', /before any source is approved or fetched as audio/i],
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
  'speaker-confirmation': {
    // P1358 R1a + R1b + R1c. No page quotes a speaker the pipeline has not
    // confirmed. The banned-sentence row is the load-bearing one: this file's
    // exemption for `speaker-labelled` quotes survived a ruling that contradicted
    // it (decisions.md 2026-08-28) for a month, and a quote reached a real event
    // page under the wrong person's name because of it.
    dw: 'P1358',
    locations: {
      [`${SKILLS}/positions.md`]: [
        ['Step 4b covers every multi-speaker source, diarized included',
          /^### Step 4b — Per-quote speaker confirmation \(every multi-speaker source, diarized included\)/m],
        // Run against the instruction view (blockquotes dropped, whitespace collapsed),
        // so the file's own record of the withdrawn sentence cannot answer for the rule —
        // epistemic.md gate 7d, where a searched file's own examples satisfy the search —
        // and a re-introduction wrapped across two lines still trips it. Backticks are
        // optional and the gap is any whitespace, because neither changes what a reader obeys.
        ['the withdrawn skip-for-speaker-labelled exemption is absent as an instruction',
          /Skip entirely for\s+`?single-speaker`?\s+and\s+`?speaker-labelled`?/i, { absent: true }],
        // The verbatim ban alone is evadable by rewording — review reinstated the rule in
        // three equivalent forms that all passed ("Skip for …", "is EXEMPT from Steps 4b
        // and 4c", the two bases in the other order). What is banned is the EXEMPTION, in
        // any wording, so this row matches the meaning within one sentence.
        ['no sentence exempts a speaker-labelled source from 4b/4c, in any wording',
          /(skip\w*|exempt\w*|waiv\w*|need not run|no need to run|do not run)[^.]{0,90}speaker-labelled|speaker-labelled[^.]{0,90}(skip\w*|exempt\w*|waiv\w*|need not|adds? nothing)/i,
          { absent: true, allowQuoted: 2 }],
        ['Step 4c receives diarized turns with the labels stripped',
          /strip the speaker labels before handing the turns over/i],
        ['only turns from a window that passed Step 2c may be used',
          /a window that PASSED Step 2c may be used/],
      ],
      [`${SKILLS}/select.md`]: [
        ['Step 2c is judged per window, never per source', /verdict is PER WINDOW, never per source/],
        ['a failed or unmeasurable window is re-diarized in <=5-minute windows',
          /re-diarized in ≤5-minute windows/],
        // P1358 R4. No predicate can observe an agent printing a packet (this file's SCOPE
        // note), so what IS checkable is that the packet's contract states the three signals
        // and states that none of them gates. Added after review pointed out the Done-When
        // implied a mechanical check that does not and cannot exist.
        ['the Gate 2 packet reports room-split as RECORDED (not measured)',
          /never calls it "passed"/],
        ['signal: no arguer opposes', /^- \*\*no arguer opposes\*\*/m],
        ['signal: the room is predicted near-unanimous', /^- \*\*room predicted near-unanimous\*\*/m],
        ['signal: the point exists to seat one arguer', /^- \*\*exists to seat one arguer\*\*/m],
        ['the three signals are signals, never gates',
          /All three are SIGNALS, never gates/],
      ],
      [`${SKILLS}/run-pipeline.md`]: [
        // The orchestrator's stop condition is the only sentence that halts Stage 3, and
        // nothing else reads this file. It named only `turn-verified` until 2026-09-28,
        // two lines under the sentence R1a had widened.
        ['the Stage 3 stop condition covers any multi-speaker basis',
          /any multi-speaker basis \(`turn-verified` \*\*or\*\* `speaker-labelled`\) with no per-quote/],
      ],
      [`${SKILLS}/clarity-night-publish.md`]: [
        ['a multi-speaker page quote needs a Step 4b + 4c record',
          /multi-speaker source may go on the page only with a Step 4b \+ 4c confirmation record/],
        ['the page-quote predicate is invoked as a command',
          /node scripts\/points\/page-quote-check\.mjs/],
      ],
    },
  },
  'page-shape': {
    // P1367. The Clarity Night page shape the founder corrected on 2026-09-28, stated where the
    // stage reads it. Scope as above: presence of the rule, not obedience; obedience on the page
    // itself is page-check.mjs's job, and it is invoked here as a command.
    dw: 'P1367',
    locations: {
      [`${SKILLS}/clarity-night-publish.md`]: [
        ['five headings, in order, nothing else', /^An opening, then these five headings, in this order, and nothing else/m],
        ['the page check is invoked as a command', /node scripts\/points\/page-check\.mjs/],
        ['/meet linked once, plain', /\*\*linked once, plain\*\*/],
        ['17. no negation opener', /^17\. \*\*No negation opener\.\*\*/m],
        ['18. never "we quoted"', /^18\. \*\*Never "we quoted"\.\*\*/m],
        ["19. never imply the people spoke about the frame term", /^19\. \*\*Never imply the people spoke about the event's frame term\*\*/m],
        ['20. no talk videos in Sources', /^20\. \*\*No talk videos in Sources\.\*\*/m],
        ['21. the round rule is what the room does, never page copy', /^21\. \*\*The round rule is what the room does, never page copy\.\*\*/m],
        ['the corrections log exists before the first correction', /The corrections log exists before the first correction/],
        ['the date is resolved by command', /node scripts\/events\/event-date\.mjs resolve/],
        ['the withdrawn seven-section list is absent', /These seven, in this order/, { absent: true }],
        ['the withdrawn "/meet stays unlinked" rule is absent', /\(`\/meet` stays unlinked\)/, { absent: true }],
      ],
      [`${SKILLS}/run-pipeline.md`]: [
        ['every stage rewrites the Now block as its last action', /rewrites the block as its last action/],
        ['the event folder and improvements.md exist before the first question', /before the first stage asks the founder anything/],
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
 * The INSTRUCTION VIEW of a file, for absent-rules only.
 *
 * An absent-rule bans a SENTENCE FROM BEING AN INSTRUCTION, while these files
 * deliberately record their own withdrawn rules as history. Separating the two is
 * the whole difficulty, and two earlier attempts got it wrong:
 *
 *   - A line-anchored regex (`^(?!>)…[^\n]*`) both false-positived on an INDENTED
 *     blockquote and missed a reinstatement WRAPPED across two lines.
 *   - Exempting every `>` blockquote was worse, and review demonstrated why: this
 *     pipeline writes **binding procedure inside blockquotes** — the 4c deadline
 *     steps, the 4c subagent prompt, "Verification is a STEP with an artifact". So
 *     the exemption covered exactly the shape a future author would use to add an
 *     exception, in the file's own normative style, one paragraph below the history.
 *
 * So the exemption is by **explicit historical marker**, not by formatting: a line
 * that says it is quoting a withdrawn rule is history, and everything else is an
 * instruction whatever it is wrapped in. Lines are then joined and whitespace
 * collapsed, so re-wrapping cannot evade a ban.
 */
const HISTORICAL = /used to read|withdrawn|no longer applies|Corrected \d{4}-\d{2}-\d{2}|Reworded \d{4}-\d{2}-\d{2}|Widened \d{4}-\d{2}-\d{2}/i

export function instructionView(text) {
  return text
    .split('\n')
    .filter(l => !HISTORICAL.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
}

/** The whole file, whitespace-collapsed — history included. Used to count how many
 *  times a banned sentence appears at all: the record is allowed ONE occurrence, so
 *  "mark your new exception as history" is not a way past the ban. */
export function collapsedView(text) {
  return text.replace(/\s+/g, ' ')
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
    for (const [label, re, opts] of rules) {
      // A rule may require a sentence to be ABSENT. P1358: the withdrawn "Skip
      // entirely for single-speaker AND speaker-labelled sources" exemption in
      // positions.md is the case — a row asserting its presence cannot stop it
      // coming back, and it came back once already by surviving a ruling that
      // contradicted it for a month.
      if (opts?.absent) {
        // Matched against the instruction view, never the raw bytes — see above.
        if (re.test(instructionView(text))) { missing.push(`${loc}: PRESENT BUT BANNED — ${label}`); continue }
        // The historical record gets ONE mention. A second occurrence means either the
        // rule was re-added behind a history marker, or the record was duplicated and
        // one copy will drift; both are findings.
        const allowed = opts.allowQuoted ?? 1
        const seen = (collapsedView(text).match(new RegExp(re.source, 'gi')) ?? []).length
        if (seen > allowed) {
          missing.push(`${loc}: QUOTED ${seen} TIMES, ${allowed} allowed — ${label}. A banned sentence marked as history more than once is how it comes back wearing the record's costume.`)
          continue
        }
        found.push(`${loc}: absent as required — ${label}`)
        continue
      }
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
