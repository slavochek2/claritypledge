#!/usr/bin/env node
/**
 * md-spans.mjs — P1244. Split markdown into COMMAND spans and PROSE.
 *
 * WHY THIS EXISTS. `store-inspection-scan.mjs` matched an inspection verb against
 * any line of a skill file. Those files are documentation: they contain sentences
 * ABOUT commands as well as commands. At the P1210 ship, widening the verb list to
 * cover realistic rewordings flagged this line, which is correct prose:
 *
 *   **Verification:** `grep -F` against the cleaned transcript … resolved strictly
 *   from the RAW `.vtt` file in the yt-store (§0.6).
 *
 * `grep -F` is an inline code span; "yt-store" is a cross-reference in prose. Read
 * as one line they look like an instruction to grep a store. Read as spans they are
 * a command fragment and a noun in a sentence, and nothing connects them.
 *
 * So the unit of matching is a COMMAND SPAN, never a line:
 *   - a fenced block is ONE unit spanning its lines (a shell block is one instruction
 *     sequence, which is also why a two-line split inside it must still be caught)
 *   - the inline code spans on a single line are concatenated into ONE unit (so
 *     `ls` … `diarize-store` on one line is caught, while a verb in code and a store
 *     name in prose is not)
 *
 * SCOPE, stated so nothing reads more into it: this makes the scanners see commands
 * only. An instruction written entirely as prose ("read the diarize store directly")
 * is NOT caught — but it never was, because the old regex needed a command verb too.
 * This narrows a measured false-positive rate to zero; it does not widen coverage of
 * prose instructions, and no caller should claim it does.
 *
 * UNTERMINATED FENCE. An opening fence with no close does NOT swallow the rest of the
 * file into code — that would re-create the false positives across the whole tail. Its
 * content is treated as prose AND the file is reported as malformed, so an unclosed
 * fence cannot become a quiet hiding place either.
 */

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/
/**
 * Inline code: `x`, ``x``. Matched over the WHOLE document rather than per line,
 * because a code span may WRAP across source lines — markdown still treats it as
 * one span, and the pipeline's own files do this. positions.md wraps
 *   `node scripts/points/store-reconcile.mjs --store-root
 *    "$DIARIZE_STORE" --ledger "$AGENT_LEDGER" …`
 * across two lines inside a blockquote. A per-line scan saw neither half as a
 * command and reported a genuinely-wired module as unwired. Unmatched backticks
 * cannot run away: the delimiters must balance for this to match at all.
 */
const INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g

/**
 * @param {string} text
 * @returns {{units: {kind:'fence'|'inline', startLine:number, endLine:number, text:string}[],
 *            malformed: {line:number, reason:string}[]}}
 */
export function commandSpans(text) {
  const lines = text.split('\n')
  const units = []
  const malformed = []

  // Pass 1 — fenced blocks. Record their line ranges so pass 2 can skip them.
  const inFence = new Array(lines.length).fill(false)
  let open = null
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE)
    if (!m) continue
    if (open === null) {
      // An opening fence's info string is not code.
      open = { start: i, marker: m[2][0], len: m[2].length }
    } else if (m[2][0] === open.marker && m[2].length >= open.len && m[3].trim() === '') {
      for (let j = open.start + 1; j < i; j++) inFence[j] = true
      units.push({
        kind: 'fence', startLine: open.start + 2, endLine: i,
        text: lines.slice(open.start + 1, i).join('\n'),
      })
      open = null
    }
  }
  if (open !== null) {
    // Deliberately NOT marked as code — see UNTERMINATED FENCE above.
    malformed.push({ line: open.start + 1, reason: 'unterminated code fence — content after it is read as prose' })
  }

  // Pass 1b — INDENTED code blocks (4+ spaces after a blank line). Legitimate
  // markdown and used by the pipeline's own fixtures and "Run This" sections; a
  // parser that knows only fences reports a genuinely-invoked module as unwired.
  // A run must be preceded by a BLANK line, which is what separates a code block
  // from the continuation of a list item or paragraph.
  {
    let i = 0
    while (i < lines.length) {
      if (inFence[i] || !/^ {4,}\S/.test(lines[i]) || (i > 0 && lines[i - 1].trim() !== '')) { i++; continue }
      let j = i
      while (j < lines.length && !inFence[j] && (/^ {4,}\S/.test(lines[j]) || lines[j].trim() === '')) j++
      while (j > i && lines[j - 1].trim() === '') j--
      units.push({ kind: 'fence', startLine: i + 1, endLine: j, text: lines.slice(i, j).join('\n') })
      for (let k = i; k < j; k++) inFence[k] = true
      i = j
    }
  }

  // Pass 2 — inline spans across the whole document, outside fenced blocks.
  // Fence lines and fenced content are blanked (newlines kept, so offsets and
  // therefore line numbers stay exact) before scanning.
  // HTML comments are masked too — a command inside <!-- --> is disabled or
  // explanatory, and treating it as executable let a documented-but-never-run
  // module read as wired (codex review 2026-09-04). Newlines are preserved so
  // every offset, and therefore every reported line number, stays exact.
  const maskComments = (t) => t.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
  const masked = maskComments(lines.map((l, i) => (inFence[i] || FENCE.test(l) ? '' : l)).join('\n'))
  const lineStarts = [0]
  for (let i = 0; i < masked.length; i++) if (masked[i] === '\n') lineStarts.push(i + 1)
  const lineOf = (off) => {
    let lo = 0, hi = lineStarts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1 }
    return lo + 1
  }
  /** @type {Map<number, {startLine:number, endLine:number, parts:string[]}>} */
  const byStartLine = new Map()
  for (const m of masked.matchAll(INLINE)) {
    const startLine = lineOf(m.index)
    const endLine = lineOf(m.index + m[0].length - 1)
    // Spans that START on the same line are one unit — `ls` … `diarize-store` on one
    // line is an instruction. Spans on different lines stay separate, so a verb on
    // line 5 and a store name on line 40 never join.
    const cur = byStartLine.get(startLine)
    if (cur) { cur.parts.push(m[2]); cur.endLine = Math.max(cur.endLine, endLine) }
    else byStartLine.set(startLine, { startLine, endLine, parts: [m[2]] })
  }
  for (const u of byStartLine.values()) {
    units.push({ kind: 'inline', startLine: u.startLine, endLine: u.endLine, text: u.parts.join(' ') })
  }

  units.sort((a, b) => a.startLine - b.startLine)
  return { units, malformed }
}

/** Convenience: does every regex in `res` match somewhere in this one unit? */
export function unitMatchesAll(unit, res) {
  return res.every(re => re.test(unit.text))
}
