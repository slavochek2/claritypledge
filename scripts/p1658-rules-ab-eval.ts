/**
 * P1658 box-rules A/B eval: runs the REAL drafting engine (executeRun) against the REAL model on the owner's own canvas drafts, once per
 * "arm" (old rules, new rules or revision 2, chosen by --shared), and writes every run's boxes, points, questions, reply and violations to a readable file.
 * Adapted from scripts/p1536-real-model-eval.ts (same fake rpc capture, same guard, same --shared loading, same judge). The database is faked;
 * nothing is written to any database.
 *
 * Usage:   EVAL_GEMINI_KEY=... npx tsx scripts/p1658-rules-ab-eval.ts --material a.md[,b.md] --arm old|new|rev2 --shared DIR --out DIR [--repeat 2] [--name LABEL]
 *          npx tsx scripts/p1658-rules-ab-eval.ts --compare LABEL_A,LABEL_B --packs a,b --out DIR   (no model call: reads the .jsonl files, writes summary-<LABEL_B>.md)
 *   --material  comma-separated files; the pack id is the file basename without .md.
 *   --arm       label only (old|new|rev2); the rules come from --shared.
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
 * keeps but the full run did not was shed for room or as a repeat. Within "support" the sub-reason is read in the engine's own order (quote,
 * number, two shared words / best guess, price terms) with the engine's own pure checks.
 * The key is read from EVAL_GEMINI_KEY and never printed. TEST only: refused when the environment names the prod project or the key is one a
 * prod env file holds (p1536-eval-guard.ts). The judge (canvas-eval-rules.ts) is loaded from --shared, so each arm is judged by its own rules.
 * The material is private: --out must resolve under a .private/ directory (refused, exit 2, otherwise). Also refused (exit 2): --arm not old|new|rev2,
 * --arm old without a --shared that differs from the working tree's, --repeat not an integer >= 1, any flag with a missing or --flag value.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- a dev-only eval script; the engine modules are loaded by path, so their types are not known here */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { envFileValues, refuseNonTest } from './p1536-eval-guard.ts';
import { CANVAS_BOXES } from '../src/lib/canvas-boxes.ts';

interface Violation { box: string; text: string; rule: string; detail?: string }
interface Drop { box: string; text: string; reason: string }
interface RunRow {
  pack: string; arm: string; run: number; state: string; code?: string; usd: number | null;
  points: Array<{ box: string; text: string }>; questions: unknown; reply: string | null; focus: string | null;
  dropped: number | null; violations: Violation[]; scope: number;
  /** The model's own new/reword points, before the engine's checks. */
  raw?: Array<{ box: string; text: string; quote: string }>;
  /** Every model point the engine did not keep, with why. */
  drops?: Drop[];
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
/** A lead point, as the spec counts it: the box's FIRST point holding one of these. */
export const LEAD_RE = /\b(?:best|biggest|first|chosen|ahead of|before)\b|, not\b/i;
/** "I", "we", "my", "our" left in a point's text ("I" only as a capital, so a stray "i" is not counted). Titles are never point text. */
export const PRONOUN_RE = /\b(?:I|[Ww]e|[Mm]y|[Oo]ur)\b/g;
/** A reason inside the point (the summary.md check a). */
export const REASON_RE = / because |, which | so they | so that /i;

export function leadOf(points: ReadonlyArray<{ box: string; text: string }>, box: string): string | null {
  const first = points.find((p) => p.box === box);
  return first && LEAD_RE.test(first.text) ? first.text : null;
}
export const pronounsIn = (text: string): string[] => text.match(PRONOUN_RE) ?? [];
/**
 * A stricter reading of a lead, reported beside the spec's count: the first point names a choice (best, biggest, first, chosen, next) AND
 * an alternative (ahead of, before, ", not", instead of, rather than). "are the first users" or "before acting" alone pass LEAD_RE but name no alternative.
 */
export const STRICT_LEAD_RE = /\b(?:best|biggest|first|chosen|next)\b[^]*(?:\bahead of\b|\bbefore\b|, not\b|\binstead of\b|\brather than\b)/i;
export function strictLeadOf(points: ReadonlyArray<{ box: string; text: string }>, box: string): boolean {
  const first = points.find((p) => p.box === box);
  return !!first && STRICT_LEAD_RE.test(first.text);
}
const titleOf = (tag: string) => CANVAS_BOXES.find((b) => b.tag === tag)?.title ?? tag;

// ── Model capture and drop reasons ──────────────────────────────────────────

/** The answer's JSON text, as canvas-read.ts reads it (thought parts skipped). */
function answerJson(response: unknown): Record<string, unknown> | null {
  const parts = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }> } | null)?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => p && p.thought !== true && typeof p.text === 'string').map((p) => p.text as string).join('').trim();
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as Record<string, unknown>; } catch { return null; }
}

type Mods = Record<string, Record<string, (...a: never[]) => unknown>>;

/**
 * Why the engine did not keep one model point: the action is parsed again ALONE through the engine's parseDraft (same material, no
 * current points, all nine boxes in scope) and the counter that moves names the class; the sub-reason of a support refusal is read with
 * the engine's own pure checks, in the order vetEvidence applies them.
 */
function dropReason(m: Mods, material: unknown, tags: string[], a: Record<string, unknown>, keptTexts: Set<string>): string | null {
  const norm = m.source!.normalizeForQuote as (s: string) => string;
  const response = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ scope: tags, actions: [a] }) }] } }] };
  const pc = {
    roundUpdate: false, material, basePoints: [], baseLabel: null, otherNames: [], ownerName: undefined, scope: { mode: 'fixed', boxes: tags },
    rebuild: [], currentFocus: null, acceptFocus: true, knownGroups: [], listOffers: true, offersOnEmptyScope: false, sections: null, allowChoice: false,
  };
  const out = (m.parse!.parseDraft as (r: unknown, p: unknown) => Record<string, unknown>)(response, pc);
  if (!out.ok) return `unparsable alone (${String(out.code)})`;
  const acts = (out.actions as Array<{ action: string; statement?: string }>).filter((x) => x.action === 'new');
  if (acts.length) {
    const s = acts[0]!.statement ?? '';
    if (keptTexts.has(norm(s))) return null; // kept (perhaps with price terms taken out)
    return 'kept alone, shed in the full run (more than 3 points in the box, or a repeat)';
  }
  if (Number(out.droppedNames) > 0) return 'names filter (canvas-names.ts)';
  if (Number(out.droppedScope) > 0) return 'scope';
  if (Number(out.droppedUnverified) > 0) {
    const haystack = (m.source!.ownerHaystack as (x: unknown) => string)(material);
    const statement = String(a.statement ?? '');
    if (!(m.source!.quoteIsOwnerSourced as (q: unknown, h: string) => boolean)(a.quote, haystack)) return 'support: quote is not verbatim owner words';
    const nums = (m.support!.numbersIn as (t: string) => Set<string>)(haystack);
    if (!(m.support!.numbersSupported as (t: string[], p: Set<string>) => boolean)([statement], nums)) return 'support: a number not in the material';
    if (!(m.support!.sharesWords as (s: string, q: string) => boolean)(statement, String(a.quote))) return 'support: shares fewer than 2 words with its quote, and is no showable best guess';
    if (a.box === 'canvas:revenue') return 'price terms (canvas-price.ts): nothing certain left of the price';
    return 'support (unclassified)';
  }
  return 'not written (unclassified)';
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
  const rowsOf = (p: string, l: string): RunRow[] => readFileSync(join(outDir, `${p}-${l}.jsonl`), 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x) as RunRow);
  const [A, B] = labels;
  const o: string[] = [`# P1658 ${A} vs ${B}: counts from the .jsonl files`, '',
    `Computed by \`scripts/p1658-rules-ab-eval.ts --compare ${A},${B}\` from \`<pack>-${A}.jsonl\` and \`<pack>-${B}.jsonl\`, each side run ${'twice'} per pack. No model judge.`, '',
    `- Lead point: the FIRST point of a ranked box (${RANKED.map(titleOf).join(', ')}) holding best, biggest, first, chosen, ahead of, before, or ", not" (the spec's count). "(loose)" marks one that passes the spec's count but not the strict one: a choice word (best, biggest, first, chosen, next) AND an alternative (ahead of, before, ", not", instead of, rather than).`,
    '- Pronouns: "I" (capital), "we", "my", "our" as whole words in point text; box titles are never counted.',
    '- Reason in a point: " because ", ", which ", " so they ", " so that ".',
    '- Dropped: the engine\'s count; every point the model wrote and the engine did not keep is named with the engine\'s reason (only for runs made by this script version; earlier files carry no model actions).', ''];
  const totals: Record<string, { leads: number; strict: number; pron: number; reasons: number; kept: number; dropped: number; named: number; runs: number }> = {};
  for (const l of labels) totals[l] = { leads: 0, strict: 0, pron: 0, reasons: 0, kept: 0, dropped: 0, named: 0, runs: 0 };
  for (const p of packs) {
    const R: Record<string, RunRow[]> = { [A]: rowsOf(p, A), [B]: rowsOf(p, B) };
    const cols = labels.flatMap((l) => R[l]!.map((r) => `${l} r${r.run}`));
    o.push(`## ${p}`, '', '### Lead points per ranked box (the lead text, or "-")', '', `| Box | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const box of RANKED) {
      const cells = labels.flatMap((l) => R[l]!.map((r) => {
        const t = leadOf(r.points, box);
        if (t) totals[l]!.leads++;
        const strict = strictLeadOf(r.points, box);
        if (strict) totals[l]!.strict++;
        return t ? `${strict ? '' : '(loose) '}${t.replace(/\|/g, '/')}` : '-';
      }));
      o.push(`| ${titleOf(box)} | ${cells.join(' | ')} |`);
    }
    o.push('', '### Kept points per box, dropped count, pronouns, reasons', '', `| | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const b of CANVAS_BOXES) o.push(`| ${b.title} | ${labels.flatMap((l) => R[l]!.map((r) => String(r.points.filter((x) => x.box === b.tag).length))).join(' | ')} |`);
    const per = (f: (r: RunRow, l: string) => number) => labels.flatMap((l) => R[l]!.map((r) => String(f(r, l)))).join(' | ');
    o.push(`| **Total kept** | ${per((r, l) => { totals[l]!.kept += r.points.length; totals[l]!.runs++; return r.points.length; })} |`);
    o.push(`| **Dropped (engine count)** | ${per((r, l) => { totals[l]!.dropped += r.dropped ?? 0; return r.dropped ?? 0; })} |`);
    o.push(`| **Pronouns I/we/my/our** | ${per((r, l) => { const n = r.points.reduce((s, x) => s + pronounsIn(x.text).length, 0); totals[l]!.pron += n; return n; })} |`);
    o.push(`| **Reason inside a point** | ${per((r, l) => { const n = r.points.filter((x) => REASON_RE.test(` ${x.text} `)).length; totals[l]!.reasons += n; return n; })} |`);
    o.push('');
    for (const l of labels) {
      for (const r of R[l]!) {
        const pron = r.points.filter((x) => pronounsIn(x.text).length);
        const reas = r.points.filter((x) => REASON_RE.test(` ${x.text} `));
        if (pron.length) { o.push(`Pronouns, ${l} r${r.run}:`); for (const x of pron) o.push(`- [${titleOf(x.box)}] ${x.text} (${pronounsIn(x.text).join(', ')})`); o.push(''); }
        if (reas.length) { o.push(`Reasons in points, ${l} r${r.run}:`); for (const x of reas) o.push(`- [${titleOf(x.box)}] ${x.text}`); o.push(''); }
        if (r.drops === undefined) { if ((r.dropped ?? 0) > 0) o.push(`Dropped, ${l} r${r.run}: ${r.dropped} (not named: this run's file has no model actions)`, ''); continue; }
        if (r.drops.length) { totals[l]!.named += r.drops.length; o.push(`Dropped, ${l} r${r.run} (named):`); for (const d of r.drops) o.push(`- [${titleOf(d.box)}] ${d.text} -> ${d.reason}`); o.push(''); }
      }
    }
  }
  o.push('## All packs', '', `| | ${A} | ${B} |`, '|---|---|---|');
  const t = (k: keyof (typeof totals)[string]) => `${totals[A]![k]} | ${totals[B]![k]}`;
  o.push(`| Runs | ${t('runs')} |`, `| Lead points, spec count (of ${RANKED.length} ranked boxes x runs) | ${t('leads')} |`,
    `| Lead points, strict (a choice word AND an alternative) | ${t('strict')} |`, `| Pronouns I/we/my/our | ${t('pron')} |`,
    `| Reasons inside points | ${t('reasons')} |`, `| Kept points | ${t('kept')} |`, `| Dropped (engine count) | ${t('dropped')} |`, `| Drops named with a reason | ${t('named')} |`, '');
  return o.join('\n');
}

async function main(): Promise<void> {
  const refuse = (msg: string): never => { console.error(`refused: ${msg}`); process.exit(2); };
  const argv = process.argv.slice(2);
  argv.forEach((a, i) => {
    if (a.startsWith('--') && (argv[i + 1] === undefined || argv[i + 1]!.startsWith('--'))) refuse(`flag ${a} needs a value`);
  });
  const outArg = arg('out');
  if (!outArg || !`${resolve(outArg)}/`.includes('/.private/')) refuse('--out is required and must be under a .private/ directory (the material is private)');
  const outDir = outArg!;
  const cmp = arg('compare');
  if (cmp) {
    const labels = cmp.split(',');
    const packs = (arg('packs') ?? '').split(',').filter(Boolean);
    if (labels.length !== 2 || !packs.length) refuse('--compare needs two labels A,B and --packs');
    writeFileSync(join(outDir, `summary-${labels[1]}.md`), compare(outDir, labels as [string, string], packs));
    console.log(`wrote ${join(outDir, `summary-${labels[1]}.md`)}`);
    return;
  }
  const key = process.env.EVAL_GEMINI_KEY ?? '';
  const workingShared = resolve('supabase/functions/_shared');
  const sharedArg = arg('shared');
  const shared = resolve(sharedArg ?? 'supabase/functions/_shared');
  const arm = arg('arm', 'old')!;
  const name = arg('name', arm)!;
  const repeat = Number(arg('repeat', '2'));
  if (arm !== 'old' && arm !== 'new' && arm !== 'rev2') refuse('--arm must be old, new or rev2');
  if (!/^[a-z0-9-]+$/.test(name)) refuse('--name must be lower-case letters, digits and dashes');
  if (arm === 'old' && (!sharedArg || shared === workingShared)) refuse('--arm old needs --shared pointing at a copy of the old _shared, not the working tree');
  if (!Number.isInteger(repeat) || repeat < 1) refuse('--repeat must be an integer >= 1');
  const files = (arg('material') ?? '').split(',').filter(Boolean);
  if (files.length === 0) { console.error('need --material'); process.exit(1); }
  const load = (f: string) => import(`${shared}/${f}.ts`);
  const [{ executeRun }, { geminiCaller }, { checkEvalPoints }, parse, source, support, defs] = await Promise.all([
    load('canvas-run'), load('canvas-model'), load('canvas-eval-rules'), load('canvas-parse'), load('canvas-source'), load('canvas-support'), load('canvas-box-definitions'),
  ]);
  const mods: Mods = { parse, source, support };
  const tags = (defs.BOX_DEFINITIONS as Array<{ tag: string }>).map((b) => b.tag);
  const refusal = refuseNonTest({ key, env: process.env, prodValues: prodEnvValues() });
  if (refusal) { console.error(refusal); process.exit(2); }
  mkdirSync(outDir, { recursive: true });

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
      const actions = ((done?.p_actions ?? []) as Array<{ action: string; box?: string; statement?: string }>).filter((a) => a.action === 'new' && a.box && a.statement);
      const points = actions.map((a) => ({ box: a.box!, text: a.statement! }));
      const rawActs = ((answerJson(seen.response)?.actions ?? []) as Array<Record<string, unknown>>)
        .filter((a) => (a.action === 'new' || a.action === 'reword') && typeof a.box === 'string' && typeof a.statement === 'string');
      const norm = source.normalizeForQuote as (s: string) => string;
      const keptTexts = new Set(points.map((p) => norm(p.text)));
      const drops: Drop[] = [];
      for (const a of rawActs) {
        const reason = seen.material ? dropReason(mods, seen.material, tags, { ...a, action: 'new' }, keptTexts) : 'no material captured';
        if (reason) drops.push({ box: String(a.box), text: String(a.statement), reason });
      }
      const row: RunRow = {
        pack, arm, run: n, state: result.state, code: result.code,
        usd: ((done ?? failed)?.p_usd ?? (failed as { p_actual_usd?: number } | undefined)?.p_actual_usd ?? null) as number | null,
        points, questions: done?.p_questions ?? null, reply: (done?.p_reply ?? failed?.p_reply ?? null) as string | null,
        focus: (done?.p_focus ?? null) as string | null, dropped: droppedLog, violations: checkEvalPoints(points, text), scope: ((done?.p_scope ?? []) as unknown[]).length,
        raw: rawActs.map((a) => ({ box: String(a.box), text: String(a.statement), quote: String(a.quote ?? '') })), drops,
      };
      rows.push(row);
      total += row.usd ?? 0;
      const perBox: Record<string, number> = {};
      for (const p of points) perBox[p.box] = (perBox[p.box] ?? 0) + 1;
      const viol: Record<string, number> = {};
      for (const v of row.violations) viol[v.rule] = (viol[v.rule] ?? 0) + 1;
      const leads = RANKED.filter((b) => leadOf(points, b)).length;
      const pron = points.reduce((s, p) => s + pronounsIn(p.text).length, 0);
      summary[pack]!.push({ run: n, state: row.state, code: row.code, pointsPerBox: perBox, pointsKept: points.length, dropped: row.dropped, dropsNamed: drops.length, leads, pronouns: pron, violationsByRule: viol, usd: row.usd });
      console.error(`${pack}#${n} ${row.state}${row.code ? `:${row.code}` : ''} points=${points.length} raw=${rawActs.length} drops=${drops.length} leads=${leads} pron=${pron} viol=${row.violations.length} usd=${row.usd}`);
    }
    writeFileSync(join(outDir, `${pack}-${name}.md`), render(pack, `${arm}, ${name}`, rows));
    writeFileSync(join(outDir, `${pack}-${name}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  console.log(JSON.stringify({ arm, name, shared, repeat, usdTotal: Number(total.toFixed(4)), packs: summary }, null, 1));
}

main().catch((e) => { console.error('eval crashed:', (e as Error).name); process.exit(1); });
