#!/usr/bin/env node
/**
 * page-check.mjs — P1367 S1. A Clarity Night event description, checked rather than described.
 *
 * WHY THIS EXISTS. On 2026-09-28 the founder rewrote the Clarity Night #2 TEST page line by
 * line for an hour. clarity-night-publish.md already said "no product vocabulary" and "short
 * sentences" (rules 8, 10) and the draft broke both. Prose rules were not enough, so the
 * shape the founder corrected the page into is checked here, on the draft, before any DB write.
 *
 * WHAT IS CHECKED (each is a founder correction of 2026-09-28, not a style preference):
 *   - the five headings, in order, and no other heading
 *   - a text opening before the first heading (it is the link preview)
 *   - sentence length: no prose sentence over MAX_WORDS words (verbatim quotes excluded)
 *   - no negation opener on the page or on any section
 *   - never "we quoted"
 *   - no product vocabulary in prose (URLs and the button's own text are exempt)
 *   - no Sources entry naming a person the page lists (their story carries their talk)
 *   - exactly one link to /meet, plain (italic), never a pill
 *   - the people's names unlinked, nothing clickable before the button
 *   - exactly one pill on the page: the button, inside "Prepare for the event"
 *   - no round-rule mechanics on the page (the room does them; the page states the norm)
 *   - no em or en dashes
 *
 * SCOPE, stated so nothing reads more into it: this checks SHAPE and a closed word list. It
 * does not judge whether a sentence is true, balanced, or well written, and the founder still
 * reviews the rendered page. Every rule here is generic: nothing in it names a topic, a person
 * or a count from any one event (P1367 risk row 1).
 */
export const id = 'page-check'

export const HEADINGS = ['Why now', 'Agenda', 'Prepare for the event', 'How Clarity Nights are different', 'Sources']

/** The longest prose sentence on the founder-corrected page of 2026-09-28 is 22 words by this
 *  script's own count (quotes excluded, list items split); rounded up to the next five. */
export const MAX_WORDS = 25

const NEGATION_OPENER = /^(no|not|never|nobody|none|neither|nothing|don't|do not|doesn't|does not|isn't|is not|it's not|it is not|this is not|this isn't|you don't|you do not|we don't|we do not|forget)\b/i
/** Product vocabulary as concepts. "points" and "stories" are plain English and allowed
 *  (rule 8), and so is "a stake in this"; these words are not, anywhere in prose. */
const PRODUCT_TERMS = /\b(agents?|calibrat\w*|understanding scores?|clarity pledge)\b/i
/** The round rule is what the room does, never page copy (decisions.md 2026-09-17; founder
 *  2026-09-28: "maybe we shouldn't talk here about mechanics"). */
const ROUND_MECHANICS = /\bout of (10|ten)\b|\b0\s*(-|to)\s*10\b|\b(under|below|at least|above|reach(es)?) (8|eight)\b|\b(8|eight) (or (more|above|higher)|\+|out of)|\b8\s*\/\s*10\b|\brates? (you|each other|them)\b/i
// A bare "8" is not mechanics: "8:30", "Room 8" and "8 people" are ordinary copy (review, 2026-09-28).

const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g
const PILL = /\*\*\[([^\]]*)\]\(([^)\s]+)\)\*\*/g

/** Split a description into { opening, sections: [{heading, body}], headings }. */
export function parse(desc) {
  const lines = desc.replace(/\r\n/g, '\n').split('\n')
  const sections = []
  const opening = []
  let cur = null
  for (const line of lines) {
    // Only "## " opens a section. A "### " subheading inside a section is body text (review,
    // 2026-09-28: a "### Round 1" under Agenda must not read as a sixth section); a level-1
    // heading is still a heading, and is reported by the heading list check.
    const m = line.match(/^#{1,2}\s+(.*?)\s*$/)
    if (m) { cur = { heading: m[1], body: [] }; sections.push(cur); continue }
    ;(cur ? cur.body : opening).push(line)
  }
  return {
    opening: opening.join('\n').trim(),
    sections: sections.map(s => ({ heading: s.heading, body: s.body.join('\n') })),
  }
}

/** Prose only: images, URLs, footnote markers and quoted speech removed; links keep their text. */
export function prose(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')          // images (alt text is not read as a sentence)
    .replace(/\*?\[\[\d+\]\]\([^)]*\)\*?/g, ' ')     // footnote markers *[[n]](url)*
    .replace(LINK, '$1')                              // links -> their text
    .replace(/"[^"\n]*"|“[^”\n]*”/g, ' QUOTE ')      // verbatim speech: not ours to shorten
    .replace(/[*_`>]/g, '')
}

/** Units of prose: a list item or a paragraph. Hand-wrapped lines inside one paragraph are
 *  joined first, or a long sentence wrapped across two source lines is counted as two short
 *  ones (review, 2026-09-28). */
function units(text) {
  const out = []
  let cur = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || /^#{1,6}\s/.test(line)) { cur = null; continue }
    if (/^(\d+\.|[-+])\s+/.test(line) || cur === null) { cur = { t: line }; out.push(cur); continue }
    cur.t += ' ' + line
  }
  return out.map(u => u.t)
}

export function sentences(text) {
  return units(prose(text))
    .map(l => l.replace(/^\s*(\d+\.|[-+])\s+/, '').trim())
    .filter(Boolean)
    .flatMap(l => l.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/))
    .map(s => s.trim())
    .filter(s => /[A-Za-z]/.test(s))
}

const words = s => s.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length

/**
 * @param {{description: string}} input
 * @returns {{ok: boolean, verdict: 'PASS'|'REJECT', findings: string[], detail: string, stats: object}}
 */
export function run(input) {
  const desc = input.description ?? ''
  const findings = []
  const { opening, sections } = parse(desc)
  const headings = sections.map(s => s.heading)
  const byName = Object.fromEntries(sections.map(s => [s.heading, s.body]))

  // 1. Headings: exactly the five, in order.
  if (JSON.stringify(headings) !== JSON.stringify(HEADINGS)) {
    findings.push(`HEADINGS: expected [${HEADINGS.join(' · ')}], got [${headings.join(' · ')}]`)
  }
  // 2. Opening.
  if (!opening) findings.push('OPENING: no text before the first heading (it is the link preview)')

  // 3. Sentence length, prose outside Sources.
  const proseParts = [opening, ...sections.filter(s => s.heading !== 'Sources').map(s => s.body)]
  const all = proseParts.flatMap(sentences)
  let longest = 0
  for (const s of all) {
    const n = words(s)
    longest = Math.max(longest, n)
    if (n > MAX_WORDS) findings.push(`SENTENCE ${n} words (max ${MAX_WORDS}): "${s.slice(0, 80)}…"`)
  }

  // 4. Negation opener: the page's first sentence and each section's first sentence.
  const openers = [['opening', opening], ...sections.filter(s => s.heading !== 'Sources').map(s => [s.heading, s.body])]
  for (const [where, body] of openers) {
    const first = sentences(body)[0]
    if (first && NEGATION_OPENER.test(first)) findings.push(`NEGATION OPENER in ${where}: "${first.slice(0, 60)}"`)
  }

  // 5. "we quoted".
  if (/\bwe quoted\b/i.test(desc)) findings.push('WE QUOTED: the page never says it quoted anyone')

  // 6. Product vocabulary in prose; the button's text is exempt.
  const noPills = desc.replace(PILL, ' ')
  const pm = prose(noPills).match(PRODUCT_TERMS)
  if (pm) findings.push(`PRODUCT TERM in prose: "${pm[0]}"`)

  // 7. Round-rule mechanics.
  const rm = prose(desc).match(ROUND_MECHANICS)
  if (rm) findings.push(`ROUND MECHANICS on the page: "${rm[0]}" (the room does this; the page states the norm)`)

  // 8. Pills: exactly one, in Prepare.
  const pills = [...desc.matchAll(PILL)]
  if (pills.length !== 1) findings.push(`PILLS: ${pills.length} on the page, exactly 1 allowed (the button)`)
  const prep = byName['Prepare for the event'] ?? ''
  if (pills.length && ![...prep.matchAll(PILL)].length) findings.push('PILLS: the button is not inside "Prepare for the event"')

  // 9. Names unlinked: nothing clickable in Prepare before the button.
  const firstPill = prep.search(/\*\*\[/)
  const before = firstPill >= 0 ? prep.slice(0, firstPill) : prep
  if (/\]\(/.test(before)) findings.push('LINK BEFORE THE BUTTON in "Prepare for the event" (names stay unlinked)')

  // 10. /meet: exactly one link, plain.
  const MEET = /^(https?:\/\/[^/]+)?\/meet\/?([?#].*)?$/   // query or fragment allowed (utm tags)
  const meetLinks = [...desc.matchAll(LINK)].filter(m => MEET.test(m[2]))
  if (meetLinks.length !== 1) findings.push(`/MEET: ${meetLinks.length} links, exactly 1 allowed`)
  if (pills.some(p => MEET.test(p[2]))) findings.push('/MEET: linked as a pill, must be plain')

  // 11. Sources never duplicate a listed person's talk: no Sources entry names a person
  //     the page lists as a bold name in Prepare. Full name anywhere in the link text, or the
  //     surname on a video link; a bare surname on an article is a namesake (review,
  //     2026-09-28: "Mel Brooks" is not Arthur Brooks).
  const people = [...prep.matchAll(/^\s*[-*]\s+\*\*([^*[\]]+)\*\*/gm)].map(m => m[1].trim())
  const sources = byName['Sources'] ?? ''
  for (const person of people) {
    const surname = person.split(/\s+/).pop()
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const hit = sources.split('\n').find(l => {
      const text = l.replace(/\]\([^)]*\)/g, ']')   // link text only, never the URL
      if (new RegExp(`\\b${esc(person)}\\b`, 'i').test(text)) return true
      return /youtube\.com|youtu\.be|vimeo\.com|ted\.com/i.test(l) && new RegExp(`\\b${esc(surname)}\\b`, 'i').test(text)
    })
    if (hit) findings.push(`SOURCES duplicates ${person}'s material (their story carries it): "${hit.trim().slice(0, 70)}"`)
  }

  // 12. Dashes.
  const dashes = (desc.match(/[–—]/g) ?? []).length
  if (dashes) findings.push(`DASHES: ${dashes} em/en dash(es)`)

  const ok = findings.length === 0
  const mean = all.length ? all.reduce((a, s) => a + words(s), 0) / all.length : 0
  const stats = { sentences: all.length, longest, mean: Math.round(mean * 10) / 10, people: people.length }
  return {
    ok, verdict: ok ? 'PASS' : 'REJECT', findings, stats,
    detail: `page-check: ${ok ? 'PASS' : 'REJECT'} (${stats.sentences} sentences, longest ${stats.longest}, mean ${stats.mean}, ${stats.people} people)` +
      (ok ? '' : '\n' + findings.map(f => `    ${f}`).join('\n')),
  }
}

/**
 * The must-fail controls, each a single mutation of a REAL page (epistemic.md gate 7d: a
 * control built on a synthetic fixture proves nothing about the real one). Every mutation
 * must turn a passing page into a REJECT. Used by --controls and by the test file.
 */
export const MUTATIONS = {
  'a sixth heading': d => d.replace('## Sources', '## Where\n\nA venue section.\n\n## Sources'),
  'a heading reordered': d => {
    const { opening, sections } = parse(d)
    const [a, b] = [sections.findIndex(s => s.heading === 'Agenda'), sections.findIndex(s => s.heading === 'Why now')]
    ;[sections[a], sections[b]] = [sections[b], sections[a]]
    return [opening, ...sections.map(s => `## ${s.heading}\n${s.body}`)].join('\n\n')
  },
  'a 30-word sentence': d => d.replace('## Agenda', 'This one sentence has been written on purpose to run on for far too long, so that it reaches a full thirty words and the checker must refuse it right now.\n\n## Agenda'),
  '"we quoted them"': d => d.replace('## Sources', 'We quoted them from their talks.\n\n## Sources'),
  'a negation opener': d => d.replace(/^([^\n#]+)/, 'Not another talk about AI. $1'),
  'a talk video added to Sources': d => {
    const prep = parse(d).sections.find(s => s.heading === 'Prepare for the event')?.body ?? ''
    const person = prep.match(/^\s*[-*]\s+\*\*([^*[\]]+)\*\*/m)?.[1] ?? 'Unknown Person'
    return d.trimEnd() + `\n9. *[${person}: the talk](https://www.youtube.com/watch?v=xxxxxxxxxxx)*\n`
  },
  '/meet removed': d => d.replace(/\*?\[([^\]]*)\]\((https?:\/\/[^/]+)?\/meet\/?\)\*?/g, '$1'),
  'a name linked': d => d.replace(/^(\s*[-*]\s+)\*\*([^*[\]]+)\*\*/m, '$1*[$2](https://example.com/person)*'),
  'a second pill': d => d.replace('## Sources', '**[Register now](https://example.com/register)**\n\n## Sources'),
  '"rate you out of 10"': d => d.replace('## Prepare for the event', 'The others rate you out of 10.\n\n## Prepare for the event'),
}

/** The finding each mutation must produce. A mutation rejected for some OTHER reason proves
 *  nothing about its own rule: the first version of these controls "passed" all ten while the
 *  base page itself failed on one unrelated word. */
export const EXPECT = {
  'a sixth heading': 'HEADINGS',
  'a heading reordered': 'HEADINGS',
  'a 30-word sentence': 'SENTENCE',
  '"we quoted them"': 'WE QUOTED',
  'a negation opener': 'NEGATION OPENER',
  'a talk video added to Sources': 'SOURCES',
  '/meet removed': '/MEET',
  'a name linked': 'LINK BEFORE THE BUTTON',
  'a second pill': 'PILLS',
  '"rate you out of 10"': 'ROUND MECHANICS',
}

export function runControls(desc) {
  const base = run({ description: desc })
  const rows = Object.entries(MUTATIONS).map(([name, mutate]) => {
    const mutated = mutate(desc)
    const r = run({ description: mutated })
    const own = r.findings.find(f => f.startsWith(EXPECT[name])) ?? null
    return { name, changed: mutated !== desc, exit: r.ok ? 0 : 1, own, finding: own ?? r.findings[0] ?? '(none)' }
  })
  return { base, rows, ok: base.ok && rows.every(r => r.changed && r.exit !== 0 && r.own) }
}

/** Read a description from a .md file, or from an event JSON (object or [object]). */
export function loadDescription(text, file = '') {
  if (file.endsWith('.json')) {
    const j = JSON.parse(text)
    const row = Array.isArray(j) ? j[0] : j
    if (typeof row?.description !== 'string') throw new Error(`${file}: no "description" string`)
    return row.description
  }
  return text
}

// Fixtures for verify-all: the must-pass is a generic page in the corrected shape; the
// must-fail is the same page with a second pill (one of the founder's corrections).
const PASS_PAGE = `A night to understand people who disagree about a hard question. Everybody is welcome.

## Why now

A recent study found something surprising. *[[1]](https://example.com/study)*

## Agenda

1. Introduction and a live demonstration of the *[Clarity Meeting Principle](https://claritypledge.com/meet)*.
2. Everybody takes a position on the contested points.
3. Conversations in groups of three.

## Prepare for the event

To prepare, read the stories of people with divergent opinions:

- **Ada Example**, researcher: "A short verbatim quote."
- **Ben Example**, founder: "Another short verbatim quote."

**[Read their stories](https://claritypledge.com/stake/example1?tab=stories)**

## How Clarity Nights are different

At our events, revealing a gap in your understanding is rewarded.

## Sources

1. *[A study, 2026](https://example.com/study)*
`
export const FIXTURES = {
  pass: { description: PASS_PAGE },
  fail: { description: MUTATIONS['a second pill'](PASS_PAGE) },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const controls = args[0] === '--controls'
  const file = controls ? args[1] : args[0]
  if (!file) {
    console.error('usage: page-check.mjs <description.md|event.json>\n       page-check.mjs --controls <real-page.md|event.json>')
    process.exit(2)
  }
  const { readFileSync } = await import('node:fs')
  const desc = loadDescription(readFileSync(file, 'utf8'), file)
  if (!controls) {
    const r = run({ description: desc })
    console.log(r.detail)
    process.exit(r.ok ? 0 : 1)
  }
  const c = runControls(desc)
  console.log(`base page: ${c.base.detail}`)
  for (const r of c.rows) console.log(`  ${r.name.padEnd(32)} exit ${r.exit}${r.changed ? '' : '  <<< MUTATION DID NOT APPLY'}${r.own ? '' : '  <<< NOT REJECTED FOR ITS OWN RULE'}  ${r.finding}`)
  console.log(c.ok ? `controls: every mutation of the real page REJECTED` : `controls: FAIL (base must pass and every mutation must apply and be rejected)`)
  process.exit(c.ok ? 0 : 1)
}
