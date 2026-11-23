/**
 * P1658 box-rules A/B eval: runs the REAL drafting engine (executeRun) against the REAL model on the owner's own canvas drafts, once per
 * "arm" (old rules, new rules, revision 2 or revision 3 / v9, chosen by --shared), and writes every run's boxes, points, questions, reply and violations to a readable file.
 * Adapted from scripts/p1536-real-model-eval.ts (same fake rpc capture, same guard, same --shared loading, same judge). The database is faked;
 * nothing is written to any database.
 *
 * Usage:   EVAL_GEMINI_KEY=... npx tsx scripts/p1658-rules-ab-eval.ts --material a.md[,b.md] --arm old|new|rev2|v9 --shared DIR --out DIR [--repeat 2] [--name LABEL]
 *          npx tsx scripts/p1658-rules-ab-eval.ts --compare LABEL_A,LABEL_B --packs a,b --out DIR   (no model call: reads the .jsonl files, writes summary-<LABEL_B>.md)
 *          npx tsx scripts/p1658-rules-ab-eval.ts --check-md FILE   (no model call, no key, no --out: applies the v9 lexical checks to a Markdown canvas
 *            file of the Copy-prompt form; prints per-canvas tables, every violation, the offer heads and empty boxes; exit 1 when any violation, else 0)
 *          npx tsx scripts/p1658-rules-ab-eval.ts --self-test   (the counters' own positive and negative controls; exit 1 on any failure)
 *   Labels and pack ids are lower-case letters, digits and dashes, and every file they name must resolve inside --out (refused, exit 2).
 *   --material  comma-separated files; the pack id is the file basename without .md.
 *   --arm       label only (old|new|rev2|v9); the rules come from --shared.
 *   --name      the output label (default: the arm), so a rerun of an arm never overwrites an earlier run's files.
 *   --shared    a copy of supabase/functions/_shared to load the engine (and so the prompt and box rules) from; default is the working tree.
 *   --repeat    runs per pack (default 2).
 *   --out       directory: <pack>-<name>.md (all runs, readable) and <pack>-<name>.jsonl (raw rows).
 * Material preprocessing (so the old box placement cannot leak into the prompt): every markdown line starting with '#' is dropped (those are
 * the lines that name a canvas box or box key), and every line starting with `reused_story_id:` (ignoring leading spaces) is dropped. All
 * other lines are kept verbatim and sent as ONE owner message.
 * Dropped points (P1658 revision 2): the engine reports only a count, so the model call is wrapped to keep the model's own actions, and each
 * new point the model wrote but the engine did not keep is named with the engine's reason. The reason comes from the engine itself: the one
 * action is parsed again alone (parseDraft, same material), and the counter it moves says why (support, names, scope); a point the alone-parse
 * keeps but the full run did not was shed for room or as a repeat (kept points are consumed as a multiset, see dropsOf). Within "support"
 * the sub-reason is read in the engine's own order (quote, number, two shared words / best guess) with the engine's own pure checks; a
 * revenue refusal past those is "unclassified (revenue)", because the unit/cadence check is not run here.
 * The key is read from EVAL_GEMINI_KEY and never printed. TEST only: refused when the environment names the prod project or the key is one a
 * prod env file holds (p1536-eval-guard.ts). The judge (canvas-eval-rules.ts) is loaded from --shared, so each arm is judged by its own rules.
 * The v9 checks (v9Violations, below) are lexical heuristics, run on every run's kept points by --compare and in each run's summary JSON; a human reads every hit.
 * The material is private: --out must resolve under a .private/ directory (refused, exit 2, otherwise). Also refused (exit 2): --arm not old|new|rev2|v9,
 * --arm old without a --shared that differs from the working tree's, --repeat not an integer >= 1, any flag with a missing or --flag value.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- a dev-only eval script; the engine modules are loaded by path, so their types are not known here */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { envFileValues, refuseNonTest } from './p1536-eval-guard.ts';
import { CANVAS_BOXES } from '../src/lib/canvas-boxes.ts';

export interface Violation { box: string; text: string; rule: string; detail?: string }
interface Drop { box: string; text: string; reason: string }
interface RunRow {
  pack: string; arm: string; run: number; state: string; code?: string; usd: number | null;
  points: Array<{ box: string; text: string }>; questions: unknown; reply: string | null; focus: string | null;
  dropped: number | null; violations: Violation[]; scope: number;
  /** The model's own new/reword points, before the engine's checks. */
  raw?: Array<{ box: string; text: string; quote: string }>;
  /** Every model point the engine did not keep, with why. */
  drops?: Drop[];
  /** Which wording produced the run: --shared's git short sha (+dirty) and a hash of the loaded BOX_DEFINITIONS. */
  git?: string; boxDefinitionsSha256?: string;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

/** Drop box-naming heading lines and reused_story_id lines; keep everything else verbatim. */
export function preprocess(text: string): string {
  return text.split('\n').filter((l) => !l.startsWith('#') && !l.trimStart().startsWith('reused_story_id:')).join('\n');
}

// ── Revision-2 counts (pure; used by --compare) ─────────────────────────────

/** The five boxes that open with a lead point under revision 2. */
export const RANKED = ['canvas:segments', 'canvas:problem', 'canvas:revenue', 'canvas:metrics', 'canvas:good-at'] as const;
/**
 * A lead point, loosely (the spec's first lexical count, kept as a secondary row): the box's FIRST point holding a choice word or an
 * alternative marker. "before" is not one (the fix round: "…understood before acting" is no lead).
 */
export const LEAD_RE = /\b(?:best|biggest|first|chosen|next|ahead of)\b|, not\b/i;
/** A choice word and an alternative marker: a STRICT lead holds both, in the same point. This is the headline count. */
export const CHOICE_RE = /\b(?:best|biggest|first|chosen|next)\b/i;
export const ALTERNATIVE_RE = /\bahead of\b|, not\b|\binstead of\b|\brather than\b/i;
/** First-person words left in a point's text ("I" and "US" only as written, so a stray "i" or the country is not counted). Titles are never point text. */
export const PRONOUN_RE = /\b(?:I|[Ww]e|[Mm]y|[Oo]urs?|[Uu]s|[Mm]e|[Mm]ine|[Yy]ou)\b/g;
/** A reason inside the point (the summary.md check a). */
export const REASON_RE = / because |, which | so they | so that /i;

export function leadOf(points: ReadonlyArray<{ box: string; text: string }>, box: string): string | null {
  const first = points.find((p) => p.box === box);
  return first && LEAD_RE.test(first.text) ? first.text : null;
}
export const pronounsIn = (text: string): string[] => text.match(PRONOUN_RE) ?? [];
export const isStrictLead = (text: string): boolean => CHOICE_RE.test(text) && ALTERNATIVE_RE.test(text);
export function strictLeadOf(points: ReadonlyArray<{ box: string; text: string }>, box: string): boolean {
  const first = points.find((p) => p.box === box);
  return !!first && isStrictLead(first.text);
}
const titleOf = (tag: string) => CANVAS_BOXES.find((b) => b.tag === tag)?.title ?? tag;

// ── Revision 3 / v9 checks (pure, lexical HEURISTICS: a human reads every hit; used by --compare, --check-md and each run's summary) ──

/** The v9 rules, in the order they are reported. */
export const V9_RULES = ['status', 'solution-stance', 'label', 'gtm-timing', 'offer-head', 'falsified-count', 'money-elsewhere', 'pronoun', 'reason'] as const;
/** The three boxes whose points must carry no status word or traction count (they say what the business does or sells, not how far it got). */
const NO_STATUS_BOXES: ReadonlySet<string> = new Set(['canvas:solution', 'canvas:channels', 'canvas:revenue']);
/** A status word or progress phrase. Word-bounded; the "; live" forms need the semicolon, which marks a status tail. */
const STATUS_RE = /\b(?:planned|piloted|pilots? run|untested|considering|considered|not tried yet|none sold|nobody (?:has )?paid|being drafted|quoted|paid by|pays? (?:it )?today|so far|not yet|under revisit|live for|is live)\b|; live\b|; planned\b/gi;
/** A traction count: "4 of its 6", "3 of the first 10", "two shops pay it" (the module's own bad example), "zero contacts were made" (v8). */
const TRACTION_RE = /\b\d+ of (?:its|the|their)(?: first)? \d+\b|\b(?:\d+|zero|no|one|two|three|four|five|six|seven|eight|nine|ten) \w+ (?:pay|pays|paid|bought|signed|joined)\b|\b(?:zero|no|0) \w+ (?:were |was )?(?:made|run|sold)\b/gi;
/** v8 status tails the word list missed (Opus review M8): an unset price, a precondition on the terms. */
const STATUS_EXTRA_RE = /\bprice not set\b|\bnot set\b|\bagreed before\b|\bbefore it starts\b/gi;
/** A stance the business keeps ("The business does not …"). Anchored on the business as subject, so a step's own negation ("if a receipt does not match") is no stance. */
const STANCE_RE = /\bthe business\s+(?:does not|doesn't|will not|won't|never)\b/gi;
/** A leading "Lead:" / "Others:" / "Other:" label, or "Lead:" anywhere. The Customer Segments role prefixes (Pays:, Uses:, Approves:) are none of these. */
const LABEL_START_RE = /^\s*(?:Lead|Others?|Target):/i;
/** "Lead:" anywhere, or the v9 shape's own scaffolding copied into a point ("Open with", "when grounded; then"). */
const LABEL_ANY_RE = /Lead:|\bOpen with\b|\bwhen grounded\b/;
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
/** Timing words in a Go-to-market point: when the plan waits, or a date. A step order ("before the deadline") is fine elsewhere, so this runs on that one box only. */
// "once a month" / "once per week" is a cadence, not a condition, so "once" counts only when no period follows it.
const TIMING_RE = new RegExp(`\\b(?:until|waits?|waiting|once(?! (?:a|an|per|every)\\b)|after|before|when|later|currently|not yet)\\b|\\bby \\d{1,2} (?:${MONTHS})\\b|\\bin (?:${MONTHS})\\b|\\b20\\d\\d\\b`, 'gi');
/** A price: a number next to EUR, USD, GBP, baht, a currency word (euro, dollar, pound) or a euro, dollar or pound sign, on either side. The founder's own v8 complaint wrote "4,500 euro". */
const MONEY_RE = /\d[\d,.]*\s?(?:EUR|USD|GBP|baht|euros?|dollars?|pounds?)\b|\d[\d,.]*\s?[€$£]|[€$£]\s?\d|\b(?:EUR|USD|GBP|baht)\s?\d/i;
/** A reason inside a point: REASON_RE, or " since ". One test, used by the v9 check and the --compare summary alike. */
export const hasReason = (text: string): boolean => REASON_RE.test(` ${text} `) || / since /i.test(` ${text} `);
const matchesOf = (re: RegExp, text: string): string[] => [...new Set((text.match(re) ?? []).map((m) => m.toLowerCase()))];

/** The words naming an offer: the text before its price, without "The offer to sell first is" and trailing ":" "," ";" "for" "at". Null when the point holds no price. */
export function offerHeadOf(text: string): string | null {
  const m = MONEY_RE.exec(text);
  if (!m) return null;
  let head = text.slice(0, m.index).replace(/^\s*The offer to sell first is\s+/i, '');
  for (;;) {
    const next = head.replace(/[\s:,;]+$/, '').replace(/\s+(?:for|at)$/i, '');
    if (next === head) break;
    head = next;
  }
  return head;
}

/** Every v9 violation in the points, and every offer head (violation or not) for manual reading. */
export function v9Violations(points: ReadonlyArray<{ box: string; text: string }>): { violations: Violation[]; offerHeads: Array<{ text: string; head: string }> } {
  const violations: Violation[] = [];
  const offerHeads: Array<{ text: string; head: string }> = [];
  const add = (p: { box: string; text: string }, rule: string, detail?: string) => violations.push({ box: p.box, text: p.text, rule, ...(detail ? { detail } : {}) });
  for (const p of points) {
    if (NO_STATUS_BOXES.has(p.box)) {
      const hits = [...matchesOf(STATUS_RE, p.text), ...matchesOf(TRACTION_RE, p.text), ...matchesOf(STATUS_EXTRA_RE, p.text)];
      if (hits.length) add(p, 'status', hits.join(', '));
    }
    if (p.box === 'canvas:solution') { const hits = matchesOf(STANCE_RE, p.text); if (hits.length) add(p, 'solution-stance', hits.join(', ')); }
    if (LABEL_START_RE.test(p.text) || LABEL_ANY_RE.test(p.text)) add(p, 'label');
    if (p.box === 'canvas:channels') { const hits = matchesOf(TIMING_RE, p.text); if (hits.length) add(p, 'gtm-timing', hits.join(', ')); }
    if (p.box === 'canvas:revenue') {
      const head = offerHeadOf(p.text);
      if (head !== null) {
        offerHeads.push({ text: p.text, head });
        // a head under 3 words, or one bare word before a comma ("Install, for those who …": the rest says who buys, not what is bought)
        const first = head.split(',')[0]!.trim();
        if (head.split(/\s+/).filter(Boolean).length < 3 || (head.includes(',') && first.split(/\s+/).length === 1)) add(p, 'offer-head', head);
      }
    }
    // not Customer Segments: "what they buy or use today" is a segment qualifier, and it may carry a price ("who pay an accountant 15,000 baht a month")
    if ((p.box === 'canvas:solution' || p.box === 'canvas:channels') && MONEY_RE.test(p.text)) add(p, 'money-elsewhere', MONEY_RE.exec(p.text)![0]);
    const pron = pronounsIn(p.text);
    if (pron.length) add(p, 'pronoun', pron.join(', '));
    if (hasReason(p.text)) add(p, 'reason');
  }
  // one violation per point past the third, so the text names what to cut
  points.filter((p) => p.box === 'canvas:world-needs').slice(3).forEach((p, i, rest) => add(p, 'falsified-count', `${rest.length + 3} points in the box`));
  return { violations, offerHeads };
}

/** The boxes holding no point, in canvas order. */
export function emptyBoxes(points: ReadonlyArray<{ box: string }>): string[] {
  return CANVAS_BOXES.map((b) => b.tag).filter((tag) => !points.some((p) => p.box === tag));
}

/** v9 violations counted per rule (only the rules that fired). */
export function v9Counts(violations: ReadonlyArray<{ rule: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of violations) counts[v.rule] = (counts[v.rule] ?? 0) + 1;
  return counts;
}

// ── --check-md: a Markdown canvas file (the Copy-prompt form) read as points ─

export interface CanvasSection { group: string | null; points: Array<{ box: string; text: string }>; unknownHeadings: string[] }

/**
 * Reads the Copy-prompt form as owners' AIs actually write it: an optional "This canvas is about <group>." line (bold or as a heading too)
 * starts each canvas section, "## <Box title>" opens a box (curly apostrophes and a trailing colon tolerated), and under it a point is a
 * line starting "- ", "* " or "1. ", or a plain unindented line (the paragraph form: the v9 self-run wrote no bullets, and a bullets-only
 * reader saw 0 points and reported 0 violations). An indented line that is not "Source:" continues the point above. "Source:" lines,
 * bold or not, are no points; "Not known yet." means the box is empty; code fences and "---" rules are skipped. A heading that is no
 * canvas box title is recorded; the points under it are read by nobody.
 */
export function parseCanvasMd(md: string): CanvasSection[] {
  const sections: CanvasSection[] = [];
  let section: CanvasSection | null = null;
  let box: string | null = null;
  let last: { box: string; text: string } | null = null;
  const open = (group: string | null): CanvasSection => { const s: CanvasSection = { group, points: [], unknownHeadings: [] }; sections.push(s); return s; };
  const plainTitle = (t: string) => t.replace(/[‘’]/g, "'").replace(/[*_:]+$/g, '').replace(/^[*_]+/, '').trim().toLowerCase();
  const isSource = (t: string) => /^[*_\s>-]*Source\s*[*_]*\s*:/i.test(t);
  const isEmpty = (t: string) => /^[*_]*Not known yet\.?[*_]*$/i.test(t);
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\r$/, '').trimEnd();
    if (/^\s*(?:```|~~~)/.test(line) || /^\s*-{3,}\s*$/.test(line)) continue;
    const about = /^(?:#+\s*)?[*_]*This canvas is about (.+?)\.?[*_]*$/.exec(line);
    if (about) { section = open(about[1]!.replace(/[*_.]+$/, '')); box = null; last = null; continue; }
    const heading = /^#{2,3}\s+(.+)$/.exec(line);
    if (heading) {
      section ??= open(null);
      const title = heading[1]!.trim();
      const found = CANVAS_BOXES.find((b) => plainTitle(b.title) === plainTitle(title));
      box = found?.tag ?? null;
      if (!found) section.unknownHeadings.push(title);
      last = null;
      continue;
    }
    if (!section || !box) continue;
    const trimmed = line.trim();
    if (trimmed === '') continue;
    // a Source line closes its point: a wrapped Source line under it must not be glued onto the point text
    if (isSource(trimmed)) { last = null; continue; }
    if (isEmpty(trimmed)) { last = null; continue; }
    const bullet = /^\s{0,3}(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet || !/^\s/.test(line)) {
      const text = (bullet ? bullet[1]! : line).trim();
      last = text === '' || isEmpty(text) ? null : { box, text };
      if (last) section.points.push(last);
      continue;
    }
    if (last) last.text += ` ${trimmed}`;
  }
  return sections;
}

/** The --check-md report: per canvas a table, the violations, the offer heads and the empty boxes; then the total (an unknown heading counts as one). */
export function checkCanvasMd(md: string): { report: string; total: number } {
  const sections = parseCanvasMd(md);
  const out: string[] = [];
  let total = 0;
  sections.forEach((s, i) => {
    const { violations, offerHeads } = v9Violations(s.points);
    for (const h of s.unknownHeadings) violations.push({ box: h, text: h, rule: 'unknown-heading' });
    total += violations.length;
    out.push(`## Canvas ${i + 1} of ${sections.length}: ${s.group ?? '(no "This canvas is about" line)'}`, '', '| Box | Points | Violations |', '|---|---|---|');
    for (const b of CANVAS_BOXES) out.push(`| ${b.title} | ${s.points.filter((p) => p.box === b.tag).length} | ${violations.filter((v) => v.box === b.tag).length} |`);
    out.push('', 'Violations:');
    if (!violations.length) out.push('(none)');
    for (const v of violations) out.push(`- [${v.rule}] ${titleOf(v.box)}: ${v.text}${v.detail ? ` (${v.detail})` : ''}`);
    out.push('', 'Offer heads (read each by hand):');
    if (!offerHeads.length) out.push('(none)');
    for (const h of offerHeads) out.push(`- ${JSON.stringify(h.head)} <- ${h.text}`);
    const empty = emptyBoxes(s.points);
    out.push('', `Empty boxes: ${empty.length ? empty.map(titleOf).join(', ') : '(none)'}`, '');
  });
  if (!sections.length) out.push('(no canvas section found)', '');
  out.push(`violations: ${total}`);
  return { report: out.join('\n'), total };
}

/** A label (--name, --compare) or pack id (a --material file's basename): lower-case letters, digits and dashes only. Throws otherwise. */
export function validId(id: string, what: string): string {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`${what} is not lower-case letters, digits and dashes: ${JSON.stringify(id)}`);
  return id;
}

/**
 * The real --out directory: created if missing, then resolved through every symlink. It must still sit under a ".private" path segment
 * after that, so a symlink cannot point --out at a public folder. Throws otherwise.
 */
export function realOutDir(outArg: string): string {
  // checked before anything is created, so a refused --out leaves no folders behind; checked again on the real path below
  if (!`${resolve(outArg)}/`.includes('/.private/')) throw new Error(`--out ${JSON.stringify(outArg)} is not under a .private directory`);
  mkdirSync(outArg, { recursive: true });
  const real = realpathSync(outArg);
  if (!`${real}/`.includes('/.private/')) throw new Error(`--out resolves to ${JSON.stringify(real)}, which is not under a .private directory`);
  return real;
}

/**
 * A file named by a label or pack id, inside the REAL --out directory: the id must be valid, the path must resolve inside the root, and an
 * existing file there must not be a symlink (writing through one would land wherever it points). Throws otherwise.
 */
export function fileInside(realRoot: string, id: string, file: string): string {
  validId(id, 'label or pack id');
  const path = resolve(join(realRoot, file));
  if (!path.startsWith(`${realRoot}/`)) throw new Error(`resolves outside --out: ${JSON.stringify(file)}`);
  if (existsSync(path) || lstatExists(path)) { if (lstatSync(path).isSymbolicLink()) throw new Error(`refusing to use a symlinked file: ${JSON.stringify(path)}`); }
  return path;
}
/** existsSync follows a symlink, so a dangling one reads as absent: lstat sees the link itself. */
function lstatExists(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}

/** The git commit and the wording a run used: the short sha of --shared's checkout (with "+dirty" when it has uncommitted changes) and a hash of the loaded BOX_DEFINITIONS. */
export function runIdentity(shared: string, boxDefinitions: unknown): { git: string; boxDefinitionsSha256: string } {
  let git = 'not a git checkout';
  try {
    const sha = execFileSync('git', ['-C', shared, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dirty = execFileSync('git', ['-C', shared, 'status', '--porcelain', '--', '.'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    git = `${sha}${dirty ? '+dirty' : ''}`;
  } catch { /* the old rules live in an extracted copy, outside any repository */ }
  return { git, boxDefinitionsSha256: createHash('sha256').update(JSON.stringify(boxDefinitions)).digest('hex').slice(0, 16) };
}

/** The counters' own controls, run by --self-test: each must hold or the script exits non-zero. */
export function selfTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
  const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
  for (const t of ['The first customers are owners of 1-3 independent cafés, ahead of bakery owners.', 'The offer to sell first is monthly books, not payroll; 2,500 baht per shop per month; paid by 6.', 'The biggest challenge is first calls, rather than pricing.']) check(isStrictLead(t), `strict lead missed: ${t}`);
  // negative controls: a choice word with no alternative ("before" is none), an alternative with no choice word
  for (const t of ['The business sends its first invoice before the deadline.', 'Owners of 1-3 independent cafés who do their own books after closing are the customers, not café chains with an in-house accountant.', 'The first users are people who own what they sell.']) check(!isStrictLead(t), `strict lead wrongly found: ${t}`);
  check(!LEAD_RE.test('they want to know they understood before acting'), 'loose count still takes "before"');
  check(pronounsIn('so I now do their books; the clients refer us to me; ours and mine').length === 5, 'pronoun regex missed I/us/me/ours/mine');
  check(pronounsIn('4 of its 6 clients came via a technician who refers it; sold in the US; the business').length === 0, 'pronoun regex matched a clean point');
  check(LEAD_RE.test('The next milestone is 10 cafés paying by March (target).'), 'loose count misses "next"');
  // v9 checks: every rule has a positive (a real v8 defect) and a negative control
  const rulesIn = (box: string, text: string) => v9Violations([{ box, text }]).violations.map((v) => v.rule);
  const fires = (box: string, text: string, rule: string) => check(rulesIn(box, text).includes(rule), `v9 ${rule} missed in ${box}: ${text}`);
  const quiet = (box: string, text: string, rule: string) => check(!rulesIn(box, text).includes(rule), `v9 ${rule} wrongly fired in ${box}: ${text}`);
  const fireDetail = (box: string, text: string, rule: string) => v9Violations([{ box, text }]).violations.find((v) => v.rule === rule)?.detail ?? '';
  // status
  const planned = 'A champion supplies a topic, then colleagues join one personally prepared online session, then one pair talks with roles while the others take positions; planned, no session run.';
  fires('canvas:solution', planned, 'status');
  check(fireDetail('canvas:solution', planned, 'status').includes('planned'), 'v9 status detail does not name the matched word');
  fires('canvas:channels', 'The business invites about 10 warm change leads to one online group session, not to one-to-one calls; not tried yet, invitations wait for a call that can run the Listening Game.', 'status');
  fires('canvas:revenue', 'Install, for those who do not want to do the work themselves: 4,500 EUR once; considered, none sold.', 'status');
  fires('canvas:revenue', 'Monthly books for one cafe: 2,500 baht per shop; 4 of its 6 clients pay today.', 'status');
  fires('canvas:revenue', 'Monthly books for one cafe: 2,500 baht per shop; nobody has paid so far.', 'status');
  quiet('canvas:solution', 'An owner photographs each receipt into a chat thread, the business logs it that night, then files the return before the deadline.', 'status');
  quiet('canvas:revenue', 'Monthly books and tax filing for one café: 2,500 baht per shop per month.', 'status');
  quiet('canvas:segments', 'Cafe owners, untested so far, are the customers.', 'status'); // status words are checked in three boxes only
  quiet('canvas:problem', 'Owners say a pilot is planned and nobody has paid, which is why the problem is theirs.', 'status');
  // solution-stance
  fires('canvas:solution', 'The business does not discuss paid support before the room shows adoption.', 'solution-stance');
  fires('canvas:solution', "The business doesn't claim to make a team correct; it will never promise accuracy.", 'solution-stance');
  quiet('canvas:solution', 'An owner photographs each receipt into a chat thread, the business logs it that night, then files the return before the deadline.', 'solution-stance');
  quiet('canvas:problem', 'Owners do not check the receipts before the deadline.', 'solution-stance'); // the stance check is for the Solution box only
  // label
  fires('canvas:segments', 'Lead: The first customers are internal champions at organizations of about 100 to 1,000 people, ahead of seed-to-Series-A teams.', 'label');
  fires('canvas:revenue', 'lead: one monthly package', 'label');
  fires('canvas:problem', 'Others: colleagues who agree and move on.', 'label');
  fires('canvas:metrics', 'The next milestone, Lead: ten invitations.', 'label');
  for (const t of ['Pays: the café owner.', 'Uses: the bookkeeper at the shop.', 'Approves: the head of finance.']) quiet('canvas:segments', t, 'label');
  // gtm-timing (the Go-to-market box only)
  fires('canvas:channels', 'The business invites about 10 warm change leads to one online group session, not to one-to-one calls; not tried yet, invitations wait for a call that can run the Listening Game.', 'gtm-timing');
  fires('canvas:channels', 'The business answers questions in two groups by 6 March.', 'gtm-timing');
  fires('canvas:channels', 'The business starts in March with two groups.', 'gtm-timing');
  fires('canvas:channels', 'The business is currently in two groups.', 'gtm-timing');
  fires('canvas:channels', 'Groups come later, once the first session ran.', 'gtm-timing');
  quiet('canvas:channels', 'The business answers tax questions weekly in two café-owner Facebook groups, not through paid ads.', 'gtm-timing');
  quiet('canvas:solution', 'An owner photographs each receipt into a chat thread, the business logs it that night, then files the return before the deadline.', 'gtm-timing');
  // offer-head
  fires('canvas:revenue', 'Install: 4,500 EUR once.', 'offer-head');
  fires('canvas:revenue', 'The offer to sell first is Install: 4,500 EUR once.', 'offer-head');
  check(v9Violations([{ box: 'canvas:revenue', text: 'Install: 4,500 EUR once.' }]).offerHeads[0]?.head === 'Install', 'v9 offer head of "Install: 4,500 EUR once." is not "Install"');
  check(v9Violations([{ box: 'canvas:revenue', text: 'The offer to sell first is Install: 4,500 EUR once.' }]).offerHeads[0]?.head === 'Install', 'v9 offer head keeps "The offer to sell first is"');
  check(v9Violations([{ box: 'canvas:revenue', text: 'Setup of the books for 400 EUR once.' }]).offerHeads[0]?.head === 'Setup of the books', 'v9 offer head keeps a trailing "for"');
  quiet('canvas:revenue', 'Monthly books and tax filing for one café: 2,500 baht per shop per month.', 'offer-head');
  quiet('canvas:revenue', 'Practice community membership: 295 EUR per month, 3 to 10 people.', 'offer-head'); // three words is enough
  quiet('canvas:revenue', 'The offer to sell first is one monthly package of chat, price not set.', 'offer-head'); // no price, no head to read
  check(v9Violations([{ box: 'canvas:revenue', text: 'The offer to sell first is one monthly package of chat, price not set.' }]).offerHeads.length === 0, 'v9 offer head listed for a point with no price');
  quiet('canvas:solution', 'Install: 4,500 EUR once.', 'offer-head'); // revenue box only
  // falsified-count: 3 points fine, 4 fire
  const fals = (n: number) => Array.from({ length: n }, (_, i) => ({ box: 'canvas:world-needs', text: `The business expected thing ${i} to spread; it did not.` }));
  check(!v9Violations(fals(3)).violations.some((v) => v.rule === 'falsified-count'), 'v9 falsified-count fired on 3 points');
  check(v9Violations(fals(4)).violations.filter((v) => v.rule === 'falsified-count').length === 1, 'v9 falsified-count missed on 4 points');
  check(!v9Violations(fals(4).map((p) => ({ ...p, box: 'canvas:problem' }))).violations.some((v) => v.rule === 'falsified-count'), 'v9 falsified-count fired outside its box');
  // money-elsewhere
  fires('canvas:solution', 'The business files the return for 2,500 baht per shop.', 'money-elsewhere');
  fires('canvas:channels', 'The business offers a first session for €50 in two groups.', 'money-elsewhere');
  fires('canvas:channels', 'The business sells a 4,500 euro install through café-owner groups.', 'money-elsewhere'); // a currency word counts too
  quiet('canvas:revenue', 'Monthly books and tax filing for one café: 2,500 baht per shop per month.', 'money-elsewhere');
  quiet('canvas:solution', 'An owner photographs each receipt into a chat thread, the business logs it that night, then files the return before the deadline.', 'money-elsewhere');
  quiet('canvas:segments', 'Change leads at organizations of about 100 to 1,000 people are the customers.', 'money-elsewhere'); // a head count is no price
  // pronoun and reason (the two reused counters, now also boxed)
  fires('canvas:problem', 'So I now do their books; the clients refer us to me.', 'pronoun');
  quiet('canvas:problem', 'The business keeps the books of small cafés; the clients refer it to colleagues.', 'pronoun');
  fires('canvas:love', 'Impact over revenue, because revenue comes second as proof of positive impact.', 'reason');
  fires('canvas:love', 'Mission over method since a failed bet changes the method only.', 'reason');
  quiet('canvas:love', 'Impact over revenue.', 'reason');
  // emptyBoxes: nine when nothing, the others in canvas order, none when full
  check(emptyBoxes([]).length === 9, 'emptyBoxes of no points is not nine');
  check(emptyBoxes([{ box: 'canvas:problem' }]).join() === CANVAS_BOXES.map((b) => b.tag).filter((t) => t !== 'canvas:problem').join(), 'emptyBoxes is not in canvas order without the filled box');
  check(emptyBoxes(CANVAS_BOXES.map((b) => ({ box: b.tag }))).length === 0, 'emptyBoxes of nine filled boxes is not empty');
  // --check-md parsing: sections, Source lines, "Not known yet.", an unknown heading, a continued point
  const md = ['This canvas is about group one.', '', '## Customer Segments', '', '- Pays: the owner.', '  Source: docs/a.md; planned, untested', '', '## Problem', 'Not known yet.', '',
    '## Made up box', '- Lead: ignored', '', 'This canvas is about group two.', '', '## Solution', '- The business logs the receipt', '  that night.', '  Source: x', ''].join('\n');
  const parsed = parseCanvasMd(md);
  check(parsed.length === 2 && parsed[0]!.group === 'group one' && parsed[1]!.group === 'group two', 'parseCanvasMd did not split two canvas sections');
  check(parsed[0]!.points.length === 1 && parsed[0]!.points[0]!.text === 'Pays: the owner.', 'parseCanvasMd read a Source line or "Not known yet." as a point');
  check(parsed[0]!.unknownHeadings.join() === 'Made up box', 'parseCanvasMd did not record the unknown heading');
  check(parsed[1]!.points[0]?.text === 'The business logs the receipt that night.', 'parseCanvasMd did not join a continued point');
  const checked = checkCanvasMd(md);
  check(checked.total === 1 && /unknown-heading/.test(checked.report) && /violations: 1$/.test(checked.report), 'checkCanvasMd did not report exactly the unknown heading');
  check(checkCanvasMd(['## Customer Segments', '- Lead: x'].join('\n')).total === 1, 'checkCanvasMd missed a label in a file with no "This canvas is about" line');
  // the forms owners' AIs write (/finish review of v9): paragraph points, "* " bullets, a fence, bold "Source:", a curly apostrophe, CRLF
  const loose = ['```markdown', '**This canvas is about group three.**', '', '## Solution', '', 'The owner sends a photo, then the business logs it.', '**Source:** docs/a.md, planned', '',
    'The business does not file unseen returns.', 'Source: docs/b.md', '', '## Hypotheses I’ve falsified', '* The business expected yearly pay; owners asked for monthly.', '---', '```'].join('\r\n');
  const lp = parseCanvasMd(loose);
  check(lp.length === 1 && lp[0]!.group === 'group three', 'parseCanvasMd missed a bold "This canvas is about" line');
  check(lp[0]!.points.filter((p) => p.box === 'canvas:solution').length === 2, 'parseCanvasMd missed paragraph-form points (the v9 self-run form)');
  check(!lp[0]!.points.some((p) => /Source|planned/.test(p.text)), 'parseCanvasMd read a bold Source line as a point or joined it');
  check(lp[0]!.points.some((p) => p.box === 'canvas:world-needs') && lp[0]!.unknownHeadings.length === 0, 'parseCanvasMd missed a curly-apostrophe heading or a "* " bullet');
  check(checkCanvasMd(loose).total === 1, 'checkCanvasMd did not find exactly the one stance in the loose-format file');
  // the review's three regex findings: a currency word, a cadence "once a month", a step's own negation
  fires('canvas:revenue', 'Install: 4,500 euro once.', 'offer-head');
  quiet('canvas:channels', 'The business hosts a Q&A once a month on LinkedIn, not through paid ads.', 'gtm-timing');
  fires('canvas:channels', 'The business posts in owner groups once the season starts.', 'gtm-timing');
  quiet('canvas:solution', 'An owner sends a receipt, then if it does not match the bank line, the business flags it.', 'solution-stance');
  // GLM review: a priced segment qualifier is legal; the state boxes stay out of the status check; v9Counts keys are exactly the fired rules
  quiet('canvas:segments', 'Owners of 1-3 cafés who pay an accountant 15,000 baht a month are the customers.', 'money-elsewhere');
  quiet('canvas:metrics', 'The next milestone is 10 cafés paying monthly by March (target), ahead of a second city.', 'status');
  quiet('canvas:good-at', 'The business is at zero pilots run and nobody paid and wants one paid pilot; the obstacle is the call tool.', 'status');
  quiet('canvas:world-needs', 'The business expected yearly pay; the owners asked for monthly; so far it sells monthly.', 'status');
  // criteria review: traction by word number and zero count (TRACTION_RE alone), v8's unset price, the shape scaffolding as a label, a bare offer word
  fires('canvas:revenue', 'Monthly books: 2,500 baht per shop per month; two shops pay it.', 'status');
  fires('canvas:channels', 'The business does not start with community organizers; zero contacts were made.', 'status');
  fires('canvas:channels', 'The business answers questions in groups; 4 of its 6 clients came via a technician.', 'status');
  fires('canvas:revenue', 'A monthly package of chat and transcripts; price not set, per month, terms agreed before the first session.', 'status');
  fires('canvas:metrics', 'Target: 10 cafés paying monthly (target).', 'label');
  fires('canvas:segments', 'Open with the first customers are cafés, not chains.', 'label');
  fires('canvas:revenue', 'Install, for those who do not want to do the work themselves: 4,500 EUR once.', 'offer-head');
  quiet('canvas:revenue', 'Monthly books and tax filing, with payroll, for one café: 2,500 baht per shop per month.', 'offer-head');
  quiet('canvas:segments', 'Pays: the café owner, who files alone.', 'label');
  const wrapped = parseCanvasMd(['## Solution', '- A step, then another.', '  Source: docs/a.md,', '  continued source text', '- Not known yet.', ''].join('\n'));
  check(wrapped[0]!.points.length === 1 && wrapped[0]!.points[0]!.text === 'A step, then another.', 'parseCanvasMd glued a wrapped Source line onto the point, or read "- Not known yet." as a point');
  const counted = v9Counts([{ rule: 'label' }, { rule: 'status' }, { rule: 'label' }]);
  check(JSON.stringify(counted) === JSON.stringify({ label: 2, status: 1 }), 'v9Counts does not count exactly the fired rules');
  // ids: a bad --name and a bad pack id are refused, a good one passes
  for (const bad of ['../x', 'a/b', 'A', '', 'Rev2c', 'rev 2']) check(throws(() => validId(bad, '--name')), `unsafe label accepted: ${JSON.stringify(bad)}`);
  check(validId('rev2c', '--name') === 'rev2c', 'a safe label was refused');
  // paths, in a real temp directory: a --out outside .private is refused, a symlinked output file is refused, a plain one is fine
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'p1658-selftest-')));
  try {
    check(throws(() => realOutDir(join(tmp, 'public'))), '--out outside .private accepted');
    const outside = join(tmp, 'public-target');
    mkdirSync(outside);
    symlinkSync(outside, join(tmp, 'link-out'));
    check(throws(() => realOutDir(join(tmp, 'link-out', '.private'))) === false, 'a real .private dir under a symlinked parent was refused');
    const priv = realOutDir(join(tmp, 'store', '.private'));
    symlinkSync(join(outside, 'x.md'), join(priv, 'pack-rev2c.md'));
    check(throws(() => fileInside(priv, 'pack', 'pack-rev2c.md')), 'a symlinked output file accepted');
    check(fileInside(priv, 'pack', 'pack-rev2d.md') === join(priv, 'pack-rev2d.md'), 'a plain output file refused');
    check(throws(() => fileInside(priv, '../x', 'summary-../x.md')), 'a ../ label accepted');
    symlinkSync(outside, join(tmp, 'sneaky'));
    check(throws(() => realOutDir(join(tmp, 'sneaky'))), 'a --out symlinked to a non-.private dir accepted');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return fails;
}

// ── Model capture and drop reasons ──────────────────────────────────────────

/** The answer's JSON text, as canvas-read.ts reads it (thought parts skipped). */
function answerJson(response: unknown): Record<string, unknown> | null {
  const parts = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }> } | null)?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => p && p.thought !== true && typeof p.text === 'string').map((p) => p.text as string).join('').trim();
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as Record<string, unknown>; } catch { return null; }
}

type Mods = Record<string, Record<string, (...a: never[]) => unknown>>;

/**
 * What the engine does with one model point ALONE: the action is parsed again through the engine's parseDraft (same material, no current
 * points, all nine boxes in scope). Kept: the box and normalized statement it is written as (the caller consumes it from the full run's
 * kept points). Refused: the counter that moved names the class; a support refusal's sub-reason is read with the engine's own pure checks,
 * in the order vetEvidence applies them. A revenue refusal that passes those three is "unclassified (revenue)": the unit/cadence check
 * (canvas-price.ts) is not run here, so no price diagnosis is claimed.
 */
function aloneVerdict(m: Mods, material: unknown, tags: string[], a: Record<string, unknown>): { kept: string } | { reason: string } {
  const norm = m.source!.normalizeForQuote as (s: string) => string;
  const response = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ scope: tags, actions: [a] }) }] } }] };
  const pc = {
    roundUpdate: false, material, basePoints: [], baseLabel: null, otherNames: [], ownerName: undefined, scope: { mode: 'fixed', boxes: tags },
    rebuild: [], currentFocus: null, acceptFocus: true, knownGroups: [], listOffers: true, offersOnEmptyScope: false, sections: null, allowChoice: false,
  };
  const out = (m.parse!.parseDraft as (r: unknown, p: unknown) => Record<string, unknown>)(response, pc);
  if (!out.ok) return { reason: `unparsable alone (${String(out.code)})` };
  const acts = (out.actions as Array<{ action: string; box?: string; statement?: string }>).filter((x) => x.action === 'new');
  if (acts.length) return { kept: `${acts[0]!.box}|${norm(acts[0]!.statement ?? '')}` }; // perhaps with price terms taken out
  if (Number(out.droppedNames) > 0) return { reason: 'names filter (canvas-names.ts)' };
  if (Number(out.droppedScope) > 0) return { reason: 'scope' };
  if (Number(out.droppedUnverified) > 0) {
    const haystack = (m.source!.ownerHaystack as (x: unknown) => string)(material);
    const statement = String(a.statement ?? '');
    if (!(m.source!.quoteIsOwnerSourced as (q: unknown, h: string) => boolean)(a.quote, haystack)) return { reason: 'support: quote is not verbatim owner words' };
    const nums = (m.support!.numbersIn as (t: string) => Set<string>)(haystack);
    if (!(m.support!.numbersSupported as (t: string[], p: Set<string>) => boolean)([statement], nums)) return { reason: 'support: a number not in the material' };
    if (!(m.support!.sharesWords as (s: string, q: string) => boolean)(statement, String(a.quote))) return { reason: 'support: shares fewer than 2 words with its quote, and is no showable best guess' };
    return { reason: a.box === 'canvas:revenue' ? 'unclassified (revenue)' : 'support (unclassified)' };
  }
  return { reason: 'not written (unclassified)' };
}

/**
 * Every model point the full run did not keep, with why. The kept points are a MULTISET keyed by box + normalized text, and each kept
 * occurrence is consumed once, so two identical model points with one kept leave one drop. Both "new" and "reword" count on both sides
 * (the kept set is built from the run's new and reword actions). These runs are first drafts with no current points, so a model "reword"
 * has nothing to reword and the engine never writes it: it is named as such without the alone-parse.
 */
function dropsOf(m: Mods, material: unknown, tags: string[], raw: Array<Record<string, unknown>>, kept: ReadonlyArray<{ box: string; text: string }>): Drop[] {
  const norm = m.source!.normalizeForQuote as (s: string) => string;
  const left = new Map<string, number>();
  for (const p of kept) { const k = `${p.box}|${norm(p.text)}`; left.set(k, (left.get(k) ?? 0) + 1); }
  const drops: Drop[] = [];
  const named = (a: Record<string, unknown>, reason: string) => drops.push({ box: String(a.box), text: String(a.statement), reason });
  const aloneKept: Array<{ a: Record<string, unknown>; key: string }> = [];
  for (const a of raw) {
    if (a.action === 'reword') { named(a, 'reword with no current point (first draft): never written'); continue; }
    if (!material) { named(a, 'no material captured'); continue; }
    const v = aloneVerdict(m, material, tags, a);
    if ('reason' in v) named(a, v.reason);
    else aloneKept.push({ a, key: v.kept });
  }
  // consume kept occurrences only after every refusal is known, so a refused point never takes a kept slot
  for (const { a, key } of aloneKept) {
    const n = left.get(key) ?? 0;
    if (n > 0) left.set(key, n - 1);
    else named(a, 'kept alone, shed in the full run (more than 3 points in the box, or a repeat)');
  }
  return drops;
}

function prodEnvValues(): string[] | null {
  const explicit = process.env.EVAL_PROD_ENV_FILE;
  if (explicit) return existsSync(explicit) ? envFileValues(readFileSync(explicit, 'utf8')) : null;
  for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
    const f = join(dir, '.env.prod');
    if (existsSync(f)) return envFileValues(readFileSync(f, 'utf8'));
  }
  return null;
}

function render(pack: string, arm: string, rows: RunRow[]): string {
  const out: string[] = [`# ${pack} (${arm} rules)`, ''];
  for (const r of rows) {
    out.push(`## Run ${r.run}: ${r.state}${r.code ? ` (${r.code})` : ''}, usd ${r.usd}, points ${r.points.length}, dropped ${r.dropped ?? 'n/a'}`, '');
    for (const b of CANVAS_BOXES) {
      const pts = r.points.filter((p) => p.box === b.tag);
      out.push(`### ${b.title} (${pts.length})`);
      if (pts.length === 0) out.push('(none)');
      for (const p of pts) out.push(`- ${p.text}`);
      out.push('');
    }
    out.push('### Questions', '');
    const qs = Array.isArray(r.questions) ? r.questions : r.questions ? [r.questions] : [];
    if (qs.length === 0) out.push('(none)');
    for (const q of qs) out.push(`- ${typeof q === 'string' ? q : JSON.stringify(q)}`);
    out.push('', '### Reply', '', r.reply ?? '(none)', '');
    out.push(`### Dropped points: ${r.dropped ?? 'n/a'} (engine count), named below with the engine's reason`, '');
    if (!r.drops?.length) out.push('(none)');
    for (const d of r.drops ?? []) out.push(`- [${d.reason}] ${titleOf(d.box)}: ${d.text}`);
    out.push('');
    out.push('### Eval violations', '');
    if (r.violations.length === 0) out.push('(none)');
    for (const v of r.violations) out.push(`- [${v.rule}] ${v.box}: ${v.text}${v.detail ? ` (${v.detail})` : ''}`);
    out.push('');
  }
  return out.join('\n');
}

// ── --compare: the side-by-side counts of two labels ────────────────────────

function compare(outDir: string, labels: [string, string], packs: string[]): string {
  const rowsOf = (p: string, l: string): RunRow[] => readFileSync(fileInside(outDir, p, `${p}-${l}.jsonl`), 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x) as RunRow);
  const [A, B] = labels;
  const data: Record<string, Record<string, RunRow[]>> = Object.fromEntries(packs.map((p) => [p, { [A]: rowsOf(p, A), [B]: rowsOf(p, B) }]));
  const runsLine = labels.map((l) => `${l}: ${packs.map((p) => `${data[p]![l]!.length} in ${p}`).join(', ')}`).join('; ');
  const wording = labels.map((l) => `${l}: ${[...new Set(packs.flatMap((p) => data[p]![l]!.map((r) => (r.boxDefinitionsSha256 ? `git ${r.git}, box definitions ${r.boxDefinitionsSha256}` : 'not recorded (older run)'))))].join(' / ')}`).join('; ');
  const o: string[] = [`# P1658 ${A} vs ${B}: counts from the .jsonl files`, '',
    `Computed by \`scripts/p1658-rules-ab-eval.ts --compare ${A},${B}\` from \`<pack>-${A}.jsonl\` and \`<pack>-${B}.jsonl\`. Runs per side: ${runsLine}. Wording: ${wording}. No model judge.`, '',
    `- Lead point (headline, strict): the FIRST point of a ranked box (${RANKED.map(titleOf).join(', ')}) holding a choice word (best, biggest, first, chosen, next) AND an alternative (ahead of, ", not", instead of, rather than) in the same point. "(loose)" marks a first point that has only one of the two (the secondary, lexical count); "before" counts as neither.`,
    '- Pronouns: "I", "we", "my", "our", "ours", "us", "me", "mine", "you" as whole words in point text ("I" and "US" as written); box titles are never counted.',
    '- Reason in a point: " because ", ", which ", " so they ", " so that ", " since ".',
    '- Dropped: the engine\'s count; every point the model wrote and the engine did not keep is named with the engine\'s reason (only for runs made by a script version that keeps the model actions; earlier files carry none).',
    `- v9 checks (lexical heuristics, a human reads every hit; computed here from the kept points, whatever the run's arm): ${V9_RULES.join(', ')}.`, ''];
  const totals: Record<string, { leads: number; strict: number; pron: number; reasons: number; kept: number; dropped: number; named: number; runs: number; v9: number }> = {};
  for (const l of labels) totals[l] = { leads: 0, strict: 0, pron: 0, reasons: 0, kept: 0, dropped: 0, named: 0, runs: 0, v9: 0 };
  for (const p of packs) {
    const R = data[p]!;
    const cols = labels.flatMap((l) => R[l]!.map((r) => `${l} r${r.run}`));
    o.push(`## ${p}`, '', '### Lead points per ranked box (the lead text, or "-")', '', `| Box | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const box of RANKED) {
      const cells = labels.flatMap((l) => R[l]!.map((r) => {
        const loose = leadOf(r.points, box);
        if (loose) totals[l]!.leads++;
        const strict = strictLeadOf(r.points, box);
        if (strict) totals[l]!.strict++;
        const text = strict ? r.points.find((x) => x.box === box)!.text : loose;
        return text ? `${strict ? '' : '(loose) '}${text.replace(/\|/g, '/')}` : '-';
      }));
      o.push(`| ${titleOf(box)} | ${cells.join(' | ')} |`);
    }
    o.push('', '### Kept points per box, dropped count, pronouns, reasons', '', `| | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const b of CANVAS_BOXES) o.push(`| ${b.title} | ${labels.flatMap((l) => R[l]!.map((r) => String(r.points.filter((x) => x.box === b.tag).length))).join(' | ')} |`);
    const per = (f: (r: RunRow, l: string) => number) => labels.flatMap((l) => R[l]!.map((r) => String(f(r, l)))).join(' | ');
    o.push(`| **Total kept** | ${per((r, l) => { totals[l]!.kept += r.points.length; totals[l]!.runs++; return r.points.length; })} |`);
    o.push(`| **Dropped (engine count)** | ${per((r, l) => { totals[l]!.dropped += r.dropped ?? 0; return r.dropped ?? 0; })} |`);
    o.push(`| **Pronouns (I, we, my, our, us, me...)** | ${per((r, l) => { const n = r.points.reduce((s, x) => s + pronounsIn(x.text).length, 0); totals[l]!.pron += n; return n; })} |`);
    o.push(`| **Reason inside a point** | ${per((r, l) => { const n = r.points.filter((x) => hasReason(x.text)).length; totals[l]!.reasons += n; return n; })} |`);
    o.push('');
    const v9 = labels.flatMap((l) => R[l]!.map((r) => ({ l, r, ...v9Violations(r.points) })));
    o.push('### v9 violations per rule', '', `| Rule | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const rule of V9_RULES) o.push(`| ${rule} | ${v9.map((x) => String(x.violations.filter((v) => v.rule === rule).length)).join(' | ')} |`);
    o.push(`| **Total** | ${v9.map((x) => { totals[x.l]!.v9 += x.violations.length; return String(x.violations.length); }).join(' | ')} |`, '');
    for (const x of v9) {
      if (!x.violations.length) continue;
      o.push(`v9 violations, ${x.l} r${x.r.run}:`);
      for (const v of x.violations) o.push(`- [${v.rule}] ${titleOf(v.box)}: ${v.text}${v.detail ? ` (${v.detail})` : ''}`);
      o.push('');
    }
    for (const l of labels) {
      for (const r of R[l]!) {
        const pron = r.points.filter((x) => pronounsIn(x.text).length);
        const reas = r.points.filter((x) => hasReason(x.text));
        if (pron.length) { o.push(`Pronouns, ${l} r${r.run}:`); for (const x of pron) o.push(`- [${titleOf(x.box)}] ${x.text} (${pronounsIn(x.text).join(', ')})`); o.push(''); }
        if (reas.length) { o.push(`Reasons in points, ${l} r${r.run}:`); for (const x of reas) o.push(`- [${titleOf(x.box)}] ${x.text}`); o.push(''); }
        if (r.drops === undefined) { if ((r.dropped ?? 0) > 0) o.push(`Dropped, ${l} r${r.run}: ${r.dropped} (not named: this run's file has no model actions)`, ''); continue; }
        if (r.drops.length) { totals[l]!.named += r.drops.length; o.push(`Dropped, ${l} r${r.run} (named):`); for (const d of r.drops) o.push(`- [${titleOf(d.box)}] ${d.text} -> ${d.reason}`); o.push(''); }
      }
    }
  }
  o.push('## All packs', '', `| | ${A} | ${B} |`, '|---|---|---|');
  const t = (k: keyof (typeof totals)[string]) => `${totals[A]![k]} | ${totals[B]![k]}`;
  o.push(`| Runs | ${t('runs')} |`, `| **Lead points (strict: a choice word AND an alternative; of ${RANKED.length} ranked boxes x runs)** | ${t('strict')} |`,
    `| Lead points, loose (secondary lexical count) | ${t('leads')} |`, `| Pronouns (I, we, my, our, us, me...) | ${t('pron')} |`,
    `| Reasons inside points | ${t('reasons')} |`, `| Kept points | ${t('kept')} |`, `| Dropped (engine count) | ${t('dropped')} |`, `| Drops named with a reason | ${t('named')} |`, `| v9 violations (all rules) | ${t('v9')} |`, '');
  return o.join('\n');
}

async function main(): Promise<void> {
  const refuse = (msg: string): never => { console.error(`refused: ${msg}`); process.exit(2); };
  if (process.argv.includes('--self-test')) {
    const fails = selfTest();
    for (const f of fails) console.error(`self-test FAIL: ${f}`);
    console.log(fails.length ? `self-test: ${fails.length} failed` : 'self-test: all checks hold');
    process.exit(fails.length ? 1 : 0);
  }
  // --check-md only reads one file: no model, no key, no --out, so it never reaches the guards below that protect writes
  if (process.argv.includes('--check-md')) {
    const file = arg('check-md');
    if (!file || file.startsWith('--')) refuse('flag --check-md needs a file');
    const runFlag = ['--material', '--arm', '--name', '--shared', '--out', '--repeat', '--compare', '--packs'].find((f) => process.argv.includes(f));
    if (runFlag) refuse(`--check-md reads one file only; ${runFlag} belongs to a model run or --compare`);
    let md: string;
    try { md = readFileSync(file!, 'utf8'); } catch (e) { return refuse(`--check-md: ${(e as Error).message}`); }
    // a wrong file (no canvas heading at all) must not read as a clean canvas
    if (!parseCanvasMd(md).length) refuse(`--check-md: ${file} holds no canvas heading ("## Customer Segments" …)`);
    const { report, total } = checkCanvasMd(md);
    console.log(report);
    process.exit(total > 0 ? 1 : 0);
  }
  const argv = process.argv.slice(2);
  argv.forEach((a, i) => {
    if (a.startsWith('--') && (argv[i + 1] === undefined || argv[i + 1]!.startsWith('--'))) refuse(`flag ${a} needs a value`);
  });
  /** Every check that can fail on a name, a path or a file goes through refuse(): one line and exit 2, never a raw stack. */
  const orRefuse = <T>(what: string, f: () => T): T => { try { return f(); } catch (e) { return refuse(`${what}: ${(e as Error).message}`); } };
  const outArg = arg('out');
  if (!outArg) refuse('--out is required and must be under a .private/ directory (the material is private)');
  const cmp = arg('compare');
  const arm = arg('arm', 'old')!;
  const name = arg('name', arm)!;
  // names are checked before anything is read, written or sent: --name, every --compare label and --packs id, every --material pack id
  orRefuse('--name', () => validId(name, '--name'));
  const files = (arg('material') ?? '').split(',').filter(Boolean);
  for (const f of files) orRefuse('--material', () => validId(basename(f, '.md'), `pack id of ${JSON.stringify(f)}`));
  const outDir = orRefuse('--out', () => realOutDir(outArg!));
  if (cmp) {
    const labels = cmp.split(',');
    const packs = (arg('packs') ?? '').split(',').filter(Boolean);
    if (labels.length !== 2 || !packs.length) refuse('--compare needs two labels A,B and --packs');
    const target = orRefuse('--compare/--packs', () => {
      for (const l of labels) validId(l, '--compare label');
      for (const p of packs) for (const l of labels) fileInside(outDir, p, `${p}-${l}.jsonl`);
      return fileInside(outDir, labels[1]!, `summary-${labels[1]}.md`);
    });
    orRefuse('--compare', () => writeFileSync(target, compare(outDir, labels as [string, string], packs)));
    console.log(`wrote ${target}`);
    return;
  }
  const key = process.env.EVAL_GEMINI_KEY ?? '';
  const workingShared = resolve('supabase/functions/_shared');
  const sharedArg = arg('shared');
  const shared = resolve(sharedArg ?? 'supabase/functions/_shared');
  const repeat = Number(arg('repeat', '2'));
  if (arm !== 'old' && arm !== 'new' && arm !== 'rev2' && arm !== 'v9') refuse('--arm must be old, new, rev2 or v9');
  if (arm === 'old' && (!sharedArg || shared === workingShared)) refuse('--arm old needs --shared pointing at a copy of the old _shared, not the working tree');
  if (!Number.isInteger(repeat) || repeat < 1) refuse('--repeat must be an integer >= 1');
  if (files.length === 0) { console.error('need --material'); process.exit(1); }
  // every output file is checked (valid id, inside the real --out, not a symlink) before the first model call
  for (const f of files) for (const ext of ['md', 'jsonl']) { const p = basename(f, '.md'); orRefuse('output file', () => fileInside(outDir, p, `${p}-${name}.${ext}`)); }
  const load = (f: string) => import(`${shared}/${f}.ts`);
  const [{ executeRun }, { geminiCaller }, { checkEvalPoints }, parse, source, support, defs] = await Promise.all([
    load('canvas-run'), load('canvas-model'), load('canvas-eval-rules'), load('canvas-parse'), load('canvas-source'), load('canvas-support'), load('canvas-box-definitions'),
  ]);
  const mods: Mods = { parse, source, support };
  const tags = (defs.BOX_DEFINITIONS as Array<{ tag: string }>).map((b) => b.tag);
  const refusal = refuseNonTest({ key, env: process.env, prodValues: prodEnvValues() });
  if (refusal) { console.error(refusal); process.exit(2); }
  const identity = runIdentity(shared, defs.BOX_DEFINITIONS);

  const summary: Record<string, Array<Record<string, unknown>>> = {};
  let total = 0;
  for (const file of files) {
    const pack = basename(file, '.md');
    const text = preprocess(readFileSync(file, 'utf8'));
    const rows: RunRow[] = [];
    summary[pack] = [];
    for (let n = 1; n <= repeat; n++) {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      let droppedLog: number | null = null;
      const origLog = console.log;
      console.log = (...a: unknown[]) => { const o = a[1] as { dropped?: number } | undefined; if (a[0] === 'canvas-draft: done' && o) droppedLog = o.dropped ?? null; };
      const run = {
        status: 'run', run_id: 'eval', kind: 'message', first_draft: true, reserved_usd: 0.27, base_label: null, focus: null, draft_points: [], material: [], other_names: [],
        thread: [{ kind: 'owner_message', text, is_trigger: true, message_id: 'm1' }],
      };
      const caller = geminiCaller(key);
      const seen: { material?: unknown; response?: unknown } = {};
      const deps = {
        rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: { status: 'ok' }, error: null }; },
        // the same caller, watched: the material the engine sent and the answer it parsed, so each dropped point can be named
        model: async (x: { kind: string; stub?: { material?: unknown } }) => { const r = await caller(x); if (x.kind === 'draft') { seen.material = x.stub?.material; seen.response = r.response; } return r; },
        readLink: async () => ({ ok: false, reason: 'unreachable' }),
      };
      let result: { state: string; code?: string };
      try { result = await executeRun(deps, { ownerId: 'eval-owner' }, run); } finally { console.log = origLog; }
      const done = calls.find((c) => c.name === '_canvas_draft_run_complete')?.args;
      const failed = calls.find((c) => c.name === '_canvas_draft_run_fail')?.args;
      // kept points: the run's written new AND reword actions (a first draft writes no reword, so this equals "new" here; both sides alike)
      const actions = ((done?.p_actions ?? []) as Array<{ action: string; box?: string; statement?: string }>).filter((a) => (a.action === 'new' || a.action === 'reword') && a.box && a.statement);
      const points = actions.map((a) => ({ box: a.box!, text: a.statement! }));
      const rawActs = ((answerJson(seen.response)?.actions ?? []) as Array<Record<string, unknown>>)
        .filter((a) => (a.action === 'new' || a.action === 'reword') && typeof a.box === 'string' && typeof a.statement === 'string');
      const drops = dropsOf(mods, seen.material, tags, rawActs, points);
      const row: RunRow = {
        pack, arm, run: n, state: result.state, code: result.code,
        usd: ((done ?? failed)?.p_usd ?? (failed as { p_actual_usd?: number } | undefined)?.p_actual_usd ?? null) as number | null,
        points, questions: done?.p_questions ?? null, reply: (done?.p_reply ?? failed?.p_reply ?? null) as string | null,
        focus: (done?.p_focus ?? null) as string | null, dropped: droppedLog, violations: checkEvalPoints(points, text), scope: ((done?.p_scope ?? []) as unknown[]).length,
        raw: rawActs.map((a) => ({ box: String(a.box), text: String(a.statement), quote: String(a.quote ?? '') })), drops, ...identity,
      };
      rows.push(row);
      total += row.usd ?? 0;
      const perBox: Record<string, number> = {};
      for (const p of points) perBox[p.box] = (perBox[p.box] ?? 0) + 1;
      const viol: Record<string, number> = {};
      for (const v of row.violations) viol[v.rule] = (viol[v.rule] ?? 0) + 1;
      const leads = RANKED.filter((b) => strictLeadOf(points, b)).length;
      const pron = points.reduce((s, p) => s + pronounsIn(p.text).length, 0);
      const v9 = v9Violations(points).violations;
      summary[pack]!.push({ run: n, state: row.state, code: row.code, pointsPerBox: perBox, pointsKept: points.length, dropped: row.dropped, dropsNamed: drops.length, leads, pronouns: pron, violationsByRule: viol, v9ByRule: v9Counts(v9), v9Total: v9.length, usd: row.usd });
      console.error(`${pack}#${n} ${row.state}${row.code ? `:${row.code}` : ''} points=${points.length} raw=${rawActs.length} drops=${drops.length} leads=${leads} pron=${pron} viol=${row.violations.length} v9=${v9.length} usd=${row.usd}`);
    }
    orRefuse('output file', () => writeFileSync(fileInside(outDir, pack, `${pack}-${name}.md`), render(pack, `${arm}, ${name}`, rows)));
    orRefuse('output file', () => writeFileSync(fileInside(outDir, pack, `${pack}-${name}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
  }
  console.log(JSON.stringify({ arm, name, shared, ...identity, repeat, usdTotal: Number(total.toFixed(4)), packs: summary }, null, 1));
}

main().catch((e) => { console.error('eval crashed:', (e as Error).name); process.exit(1); });
