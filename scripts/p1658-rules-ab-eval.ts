/**
 * P1658 box-rules A/B eval: runs the REAL drafting engine (executeRun) against the REAL model on the owner's own canvas drafts, once per
 * "arm" (old or new box rules, chosen by --shared), and writes every run's boxes, points, questions, reply and violations to a readable file.
 * Adapted from scripts/p1536-real-model-eval.ts (same fake rpc capture, same guard, same --shared loading, same judge). The database is faked;
 * nothing is written to any database.
 *
 * Usage:   EVAL_GEMINI_KEY=... npx tsx scripts/p1658-rules-ab-eval.ts --material a.md[,b.md] --arm old|new --shared DIR --out DIR [--repeat 2]
 *   --material  comma-separated files; the pack id is the file basename without .md.
 *   --arm       label only (old|new), used in the output file names; the rules come from --shared.
 *   --shared    a copy of supabase/functions/_shared to load the engine (and so the prompt and box rules) from; default is the working tree.
 *   --repeat    runs per pack (default 2).
 *   --out       directory: <pack>-<arm>.md (all runs, readable) and <pack>-<arm>.jsonl (raw rows).
 * Material preprocessing (so the old box placement cannot leak into the prompt): every markdown line starting with '#' is dropped (those are
 * the lines that name a canvas box or box key), and every line starting with `reused_story_id:` (ignoring leading spaces) is dropped. All
 * other lines are kept verbatim and sent as ONE owner message.
 * The key is read from EVAL_GEMINI_KEY and never printed. TEST only: refused when the environment names the prod project or the key is one a
 * prod env file holds (p1536-eval-guard.ts). The judge (canvas-eval-rules.ts) is always the working tree's.
 * The material is private: write --out only under .private/.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- a dev-only eval script; the engine modules are loaded by path, so their types are not known here */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { envFileValues, refuseNonTest } from './p1536-eval-guard.ts';
import { CANVAS_BOXES } from '../src/lib/canvas-boxes.ts';

interface Violation { box: string; text: string; rule: string; detail?: string }
interface RunRow {
  pack: string; arm: string; run: number; state: string; code?: string; usd: number | null;
  points: Array<{ box: string; text: string }>; questions: unknown; reply: string | null; focus: string | null;
  dropped: number | null; violations: Violation[]; scope: number;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

/** Drop box-naming heading lines and reused_story_id lines; keep everything else verbatim. */
export function preprocess(text: string): string {
  return text.split('\n').filter((l) => !l.startsWith('#') && !l.trimStart().startsWith('reused_story_id:')).join('\n');
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
    out.push(`### Dropped points: ${r.dropped ?? 'n/a'} (the engine reports a count only; a failed run's reply above names what it cut)`, '');
    out.push('### Eval violations', '');
    if (r.violations.length === 0) out.push('(none)');
    for (const v of r.violations) out.push(`- [${v.rule}] ${v.box}: ${v.text}${v.detail ? ` (${v.detail})` : ''}`);
    out.push('');
  }
  return out.join('\n');
}

async function main(): Promise<void> {
  const key = process.env.EVAL_GEMINI_KEY ?? '';
  const shared = resolve(arg('shared', 'supabase/functions/_shared')!);
  const arm = arg('arm', 'old')!;
  const outDir = arg('out');
  const repeat = Number(arg('repeat', '2'));
  const files = (arg('material') ?? '').split(',').filter(Boolean);
  if (files.length === 0 || !outDir) { console.error('need --material and --out'); process.exit(1); }
  const load = (f: string) => import(`${shared}/${f}.ts`);
  const [{ executeRun }, { geminiCaller }, { checkEvalPoints }] = await Promise.all([load('canvas-run'), load('canvas-model'), import(resolve('supabase/functions/_shared/canvas-eval-rules.ts'))]);
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
      const deps = {
        rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: { status: 'ok' }, error: null }; },
        model: geminiCaller(key),
        readLink: async () => ({ ok: false, reason: 'unreachable' }),
      };
      let result: { state: string; code?: string };
      try { result = await executeRun(deps, { ownerId: 'eval-owner' }, run); } finally { console.log = origLog; }
      const done = calls.find((c) => c.name === '_canvas_draft_run_complete')?.args;
      const failed = calls.find((c) => c.name === '_canvas_draft_run_fail')?.args;
      const actions = ((done?.p_actions ?? []) as Array<{ action: string; box?: string; statement?: string }>).filter((a) => a.action === 'new' && a.box && a.statement);
      const points = actions.map((a) => ({ box: a.box!, text: a.statement! }));
      const row: RunRow = {
        pack, arm, run: n, state: result.state, code: result.code,
        usd: ((done ?? failed)?.p_usd ?? (failed as { p_actual_usd?: number } | undefined)?.p_actual_usd ?? null) as number | null,
        points, questions: done?.p_questions ?? null, reply: (done?.p_reply ?? failed?.p_reply ?? null) as string | null,
        focus: (done?.p_focus ?? null) as string | null, dropped: droppedLog, violations: checkEvalPoints(points, text), scope: ((done?.p_scope ?? []) as unknown[]).length,
      };
      rows.push(row);
      total += row.usd ?? 0;
      const perBox: Record<string, number> = {};
      for (const p of points) perBox[p.box] = (perBox[p.box] ?? 0) + 1;
      const viol: Record<string, number> = {};
      for (const v of row.violations) viol[v.rule] = (viol[v.rule] ?? 0) + 1;
      summary[pack]!.push({ run: n, state: row.state, code: row.code, pointsPerBox: perBox, pointsKept: points.length, dropped: row.dropped, violationsByRule: viol, usd: row.usd });
      console.error(`${pack}#${n} ${row.state}${row.code ? `:${row.code}` : ''} points=${points.length} viol=${row.violations.length} usd=${row.usd}`);
    }
    writeFileSync(join(outDir, `${pack}-${arm}.md`), render(pack, arm, rows));
    writeFileSync(join(outDir, `${pack}-${arm}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  console.log(JSON.stringify({ arm, shared, repeat, usdTotal: Number(total.toFixed(4)), packs: summary }, null, 1));
}

main().catch((e) => { console.error('eval crashed:', (e as Error).name); process.exit(1); });
