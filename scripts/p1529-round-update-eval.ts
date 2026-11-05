/**
 * P1529 D23 real-model check: the REAL drafting engine (executeRun) and the REAL model read one invented round transcript, shaped as
 * make_my_next_version sends it (one forward copy per line). The database is faked; nothing is written anywhere. People and firms are invented.
 *
 * Usage: EVAL_GEMINI_KEY=... npx tsx scripts/p1529-round-update-eval.ts --transcript <file.json> [--repeat 1] [--no-round-mode] [--out f.json]
 * TEST only: refused when the environment names prod or the key is one a prod env file holds (p1536-eval-guard.ts).
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-explicit-any -- a dev-only eval over a fixture it defines itself */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { envFileValues, refuseNonTest } from './p1536-eval-guard.ts';

const NAMES: Record<string, string> = { owner: 'Mara Lind', partner: 'Tomas Berg', observer: 'Ines Vale' };
const BASE: Array<[string, string]> = [
  ['canvas:segments', 'B2B SaaS companies'],
  ['canvas:problem', "Users don't understand the product"],
  ['canvas:solution', 'Short onboarding videos'],
  ['canvas:channels', 'LinkedIn posts'],
  ['canvas:revenue', '2,400 euros for a package of 5 videos'],
  ['canvas:metrics', '4 new clients by March 2027'],
  ['canvas:good-at', 'Not enough leads'],
];
const ALL_BOXES = ['canvas:segments', 'canvas:problem', 'canvas:solution', 'canvas:channels', 'canvas:revenue', 'canvas:metrics', 'canvas:love', 'canvas:good-at', 'canvas:world-needs'];
const TRIGGER = 'Update my canvas from what was said in Round 1, in my own words.';

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
function prodValues(): string[] | null {
  for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
    const f = join(dir, '.env.prod');
    if (existsSync(f)) return envFileValues(readFileSync(f, 'utf8'));
  }
  return null;
}

async function main() {
  const key = process.env.EVAL_GEMINI_KEY ?? '';
  const refusal = refuseNonTest({ key, env: process.env, prodValues: prodValues() });
  if (refusal) { console.error(refusal); process.exit(2); }
  const shared = resolve('supabase/functions/_shared');
  const [{ executeRun }, { geminiCaller }] = await Promise.all([import(`${shared}/canvas-run.ts`), import(`${shared}/canvas-model.ts`)]);
  const lines = (JSON.parse(readFileSync(arg('transcript')!, 'utf8')) as { lines: Array<{ who: string; text: string }> }).lines;
  const roundMode = !process.argv.includes('--no-round-mode');
  const results: unknown[] = [];
  for (let n = 1; n <= Number(arg('repeat', '1')); n++) {
    const calls: Array<{ name: string; args: Record<string, any> }> = [];
    const run = {
      status: 'run', run_id: 'eval', kind: 'message', first_draft: false, reserved_usd: 0.27, base_label: 'v1', focus: 'Onboarding videos for small B2B software companies',
      box_refs: ALL_BOXES, input_kind: 'text', offers: [], other_names: [NAMES.partner, NAMES.observer, 'Tomas', 'Ines'], owner_name: NAMES.owner, material: [],
      draft_points: BASE.map(([box, statement], i) => ({ id: `p${i}`, box, statement, statement_v1: statement })),
      thread: [
        ...lines.map((l, i) => ({ kind: 'clarify_copy', label: NAMES[l.who], lines: [{ by: l.who === 'owner' ? 'owner' : 'other', text: l.text }], message_id: `c${i}` })),
        { kind: 'owner_message', text: TRIGGER, is_trigger: true, box_refs: ALL_BOXES, message_id: 't1' },
      ],
    };
    const deps = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === '_canvas_run_is_round_update') return { data: roundMode, error: null };
        calls.push({ name, args }); return { data: { status: 'ok' }, error: null };
      },
      model: geminiCaller(key), readLink: async () => ({ ok: false, reason: 'unreachable' }),
    };
    const started = Date.now();
    const summary = await executeRun(deps, { ownerId: 'eval-owner' }, run);
    const done = calls.find((c) => c.name === '_canvas_draft_run_complete')?.args;
    const failed = calls.find((c) => c.name === '_canvas_draft_run_fail')?.args;
    results.push({ n, state: summary.state, code: summary.code, ms: Date.now() - started, usd: done?.p_usd ?? failed?.p_actual_usd, actions: done?.p_actions, reply: done?.p_reply ?? failed?.p_reply, scope: done?.p_scope });
  }
  const out = arg('out');
  if (out) writeFileSync(out, JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results, null, 1));
}
main().catch((e) => { console.error('eval crashed:', (e as Error).message); process.exit(1); });
