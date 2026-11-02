/**
 * P1536 real-model eval (S2.2, Q1 / INBOX-260, S5.1): runs the REAL drafting engine (executeRun: prompt, model call, every check, the
 * reply) against the REAL model on a set of realistic first-draft packs, and judges each written point with the eval rules
 * (supabase/functions/_shared/canvas-eval-rules.ts). The database is faked; nothing is written anywhere.
 *
 * Usage:   EVAL_GEMINI_KEY=... npx tsx scripts/p1536-real-model-eval.ts --out results.jsonl [--repeat 1] [--packs a1,a2] [--shared DIR]
 *   --shared DIR   load the engine from DIR (a copy of supabase/functions/_shared) instead of the working tree: how a "before" run is made.
 * The key is read from the environment, never printed. TEST only: the run is refused when the environment names the prod project or the key is one a
 * prod env file holds (p1536-eval-guard.ts; EVAL_PROD_ENV_FILE overrides where `.env.prod` is looked for, else it is searched upward from the cwd). Prints one summary; every run's raw output goes to --out (JSON lines).
 * Packs are invented for this eval: no real person, firm or customer.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-explicit-any -- a dev-only eval script over packs it defines itself; the engine modules are loaded by path, so their types are not known here */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { envFileValues, refuseNonTest } from './p1536-eval-guard.ts';

interface Pack { id: string; label: string; text: string; expect: { offers: 'none' | 'some'; groups?: number; focusHint?: string } }

const PACKS: Pack[] = [
  {
    id: 'cafe', label: 'single: bookkeeping for cafes',
    text: `I run a small bookkeeping service for independent cafe owners in Tallinn, mostly people with one to three shops who do their own books after closing. The pain is the week before the VAT deadline: they sort a quarter of receipts at once and still miss deductions. What I do: owners photograph each receipt into a chat thread when they pay, I log it the same night and close the books monthly. I charge 180 euros per shop per month. Six shops pay this today; two more are trying it free for a month. Most clients came through an espresso-machine technician who refers me, and I answer tax questions in a Facebook group for cafe owners every week. I want 10 shops paying by 31 March 2027. My biggest problem is that I am at 6 shops and replies to cold messages are rare: I think strangers writing about money look like scams. I value being straight over being liked, because owners decide about their money on what I tell them. I once expected owners to want per-receipt pricing, offered both options to 5 prospects, and all 5 chose the flat fee, so I dropped per-receipt.`,
    expect: { offers: 'none' },
  },
  {
    id: 'dental', label: 'single: appointment software for dental clinics',
    text: `We build appointment reminder software for independent dental clinics with two to six chairs. The practice manager is the one who buys and uses it, usually a woman in her 40s who also does the front desk, and she is worried about no-shows because every empty chair costs the clinic about 90 euros an hour. Today they call patients by hand or send texts from a phone. Our product sends the reminder by text and lets the patient confirm or move the slot, so the manager stops calling. It is live in 3 clinics, each pays 59 euros a month, and a fourth is in a pilot. We found the first clinics through a dental supplier who mentions us on his visits and through one talk at a regional dentists' association. Next: 12 clinics paying by September 2027. The thing that stops us is that managers distrust new tools after a bad experience with a booking system that double-booked patients. Our rule: we choose a slower rollout over a faster one, because a double-booked patient costs a clinic more than a week of delay.`,
    expect: { offers: 'none' },
  },
  {
    id: 'designers', label: 'single: invoice reminders for freelance designers',
    text: `My tool chases late invoices for freelance designers and illustrators who work alone and send 5 to 15 invoices a month. They hate chasing money because it feels like nagging a client they want to keep, and many are in their late 20s and early 30s and used to bad payers. The tool sends a polite reminder in the designer's own tone at 7, 14 and 30 days, and the designer approves the first one. Pricing is 19 euros a month, with no yearly plan yet. 22 designers use it free in a beta; none has paid so far. I post in two illustration communities and ask beta users for introductions. I want 40 paying users by June 2027. I do not know yet whether designers will pay for software that "just nags"; that is my biggest worry. Honesty over speed, because designers will forgive a slow tool faster than one that overpromises.`,
    expect: { offers: 'none' },
  },
  {
    id: 'hr-pivot', label: 'single with a dead pivot (S2.4 renewal fixture)',
    text: `Since spring I work only with solo therapists and counsellors who need a simple tool for session notes and invoices; most are in private practice, over 40, and not comfortable with technology. They pay 35 euros a month and 9 of them do today. Before that I sold a feedback tool to HR teams. I expected HR teams to renew after the pilot; 0 of 4 renewed, so I stopped selling to HR. I reach therapists through two professional association newsletters and word of mouth from a supervisor who recommends me. I want 25 paying therapists by 30 June 2027. My main obstacle is that therapists will not paste client notes into anything they do not fully trust, so I think I need to explain where data lives before anything else.`,
    expect: { offers: 'none' },
  },
  {
    id: 'price-gap', label: 'single: a price with no unit or cadence (S2.3)',
    text: `I help small law firms of 3 to 10 lawyers move their client intake onto one online form with automatic conflict checks. The managing partner buys it; the office administrator uses it daily and complains about re-typing emails into the case system. It costs 1500 for the setup and the firm is considering a yearly plan. Two firms in Riga use it now. I get introduced to firms by an accountant who serves several of them. I want 6 firms by December 2027. I am the only developer, so my biggest challenge is that I cannot onboard more than one firm a month.`,
    expect: { offers: 'none' },
  },
  {
    id: 'coach', label: 'single: coach with an offer ladder and a typed focus',
    text: `I coach first-time engineering managers at software companies with 50 to 500 staff, typically promoted from developer in the last year and in their early 30s. They struggle with giving feedback and end up either avoiding hard conversations or overcorrecting. I sell a 49 euro workshop, a 900 euro three-month programme and a 4,000 euro retreat for a small group. Last quarter 14 people attended the workshop, 3 bought the programme and nobody has paid for the retreat yet. I find them through a monthly meetup for engineering leads and referrals from former participants. I want 6 programme clients by 30 September 2027. I chose long-term skills over quick tips, because managers who learn a habit stop needing me. I assumed managers would pay for the retreat; 0 of 12 invited said yes, so I am rethinking it.`,
    expect: { offers: 'none' },
  },
  {
    id: 'mixed2', label: 'two businesses; the owner states the focus (S5.1, J7)',
    text: `I run two things. My main business, and the one I am focusing on this year, is bookkeeping for independent cafe owners with one to three shops in Tallinn: 180 euros per shop per month, five shops pay, and they found me through a coffee-machine technician. Separately I teach Instagram basics to yoga teachers in an online course, 79 euros per person, which I made last year and have sold 11 times. The yoga teachers are mostly women aged 30 to 45 who run one-person studios. For cafes I want 10 paying shops by 31 March 2027. Cafe owners' biggest problem is the VAT deadline panic; yoga teachers' is that they do not know what to post. I value honesty over speed, because both audiences trust me for plain advice.`,
    expect: { offers: 'some', groups: 1, focusHint: 'caf' },
  },
  {
    id: 'mixed3', label: 'three businesses; the one that already pays should win (S5.1, J8)',
    text: `Notes from my week. Cafe owners: I log receipts and close their books monthly, 180 euros per shop per month, and 6 shops pay me today, that is where my income comes from. Marketing agencies: I talked to three agencies about outsourcing their invoicing, they were interested, nobody has paid, I sent one quote for 900 euros a month. Freelance photographers: I built a small invoice template for them last month and have 4 free users, I have not charged anything. Café owners reach me through a technician who refers me; agencies came through a LinkedIn post; photographers came through a Facebook group. Next milestone: 10 cafe shops paying by 31 March 2027.`,
    expect: { offers: 'some', groups: 2, focusHint: 'caf' },
  },
  {
    id: 'partners', label: 'one business plus a referrer, an investor and a grant (no offer expected)',
    text: `I make handmade soy candles and sell them to gift buyers: women and men in their 30s to 50s buying for friends and colleagues, on Etsy and at four weekend markets in Tartu. A candle costs 18 euros, a set of three 45 euros, and I sold 140 candles last quarter. A local coffee supplier lets me leave a box of candles at his counter and sends gift buyers my way, an angel investor has said he might put in 5,000 euros next spring, and the city has a green-business grant I plan to apply for. Those three help me reach people and fund the work; none of them buys candles from me. I want 400 candles a quarter by December 2027. My biggest problem is that wax prices rose and I cannot raise prices at markets without losing regulars.`,
    expect: { offers: 'none' },
  },
  {
    id: 'reason-most', label: 'two groups, no stated focus, nobody has paid: one is far richer in material (most_boxes)',
    text: `I have two ideas for a stock-planning spreadsheet. For small bakeries: owners with one or two shops throw away about a fifth of their dough because they guess the weekend order. The sheet takes last month's sales and suggests the dough per day. I would sell it for 12 euros a month, and I plan to demo it at the bakers' association meeting in May and to post in two baker groups. I want 10 bakeries trying it by 30 June 2027. My biggest challenge is that bakers do not trust a spreadsheet they did not build. I choose accuracy over polish, because a wrong suggestion wastes more dough than an ugly sheet. For florists I have only a thought that the same idea might work, nothing more.`,
    expect: { offers: 'some', groups: 1, focusHint: 'bak' },
  },
  {
    id: 'reason-narrow', label: 'two groups described alike, nobody has paid, no stated focus (narrower)',
    text: `I am torn between two groups for the same 15 euro a month booking planner: dog walkers and pet sitters. Both are solo workers in Tartu with about 10 clients, both juggle bookings in chat apps, and I have talked to three of each. Nobody has paid yet. I have no preference and I would be happy to start with either.`,
    expect: { offers: 'some', groups: 1 },
  },
];

/** Shapes the eval reads out of the engine. */
interface RunRow {
  pack: string; run: number; state: string; code?: string; usd: number | null; points: Array<{ box: string; text: string }>;
  reply: string | null; focus: string | null; focusReason: string | null; offers: string[]; violations: Array<{ box: string; text: string; rule: string; detail?: string }>;
  segments: Array<{ text: string; ok: boolean; missing: string | null }>; dropped: number | null; scope: number;
}

/** J9 pairs: a draft about one group (the pack), then a FILE about another (or the same, or a helper): does the model report the group? */
interface J9Pair { id: string; base: string; kind: 'other-group' | 'same-group' | 'helper'; file: string; mention: RegExp }
const J9: J9Pair[] = [
  {
    id: 'cafe+agencies', base: 'cafe', kind: 'other-group', mention: /agenc/i,
    file: `Notes from calls with three marketing agencies about outsourcing their invoicing. Each sends 40 to 80 invoices a month and wants someone to chase late payments. I sent one quote for 900 euros a month for an agency retainer; nobody has signed yet. The agencies came to me through a LinkedIn post. I value honesty over speed, because agencies decide on whom they trust.`,
  },
  {
    id: 'dental+vets', base: 'dental', kind: 'other-group', mention: /vet/i,
    file: `I also built a version for veterinary clinics with one to three vets. The practice manager there books follow-up visits by phone, so the same reminder idea applies. Two vet clinics pay 49 euros a month today and found me through a pet-food supplier. I want 8 vet clinics paying by December 2027.`,
  },
  {
    id: 'cafe+more-cafes', base: 'cafe', kind: 'same-group', mention: /agenc|investor/i,
    file: `More about my cafe clients: the two shops that are trying it free asked for a weekly summary of unpaid supplier invoices, and one owner said the March VAT deadline is why she signed. I now charge 180 euros per shop per month and the weekly summary is included.`,
  },
  {
    id: 'cafe+investor', base: 'cafe', kind: 'helper', mention: /investor/i,
    file: `Email from an angel investor who is interested in funding my work: he might put in 5,000 euros next spring and would introduce me to two coffee roasters. I plan to reply this week and ask what he expects in return.`,
  },
];

async function runJ9(load: (f: string) => Promise<any>, key: string, repeat: number, out: string | undefined): Promise<void> {
  const [{ executeRun }, { geminiCaller }] = await Promise.all([load('canvas-run'), load('canvas-model')]);
  const customer = new Set(['canvas:segments', 'canvas:problem', 'canvas:solution', 'canvas:channels', 'canvas:revenue', 'canvas:metrics']);
  const only = arg('pairs')?.split(',');
  const quiet = async <T,>(f: () => Promise<T>): Promise<T> => { const l = console.log; console.log = () => {}; try { return await f(); } finally { console.log = l; } };
  const rows: Array<Record<string, unknown>> = [];
  let usd = 0;
  for (const pair of J9.filter((x) => !only || only.includes(x.id))) {
    const base = PACKS.find((p) => p.id === pair.base)!;
    for (let n = 1; n <= repeat; n++) {
      const call1: Array<{ name: string; args: Record<string, unknown> }> = [];
      const real = geminiCaller(key);
      let raw: { scope: number; others: string[] } | null = null; // what the model itself returned, before the engine's own checks and the empty-scope rule
      const model = async (c: unknown) => {
        const r = await real(c as never);
        try {
          const txt = (r.response as { candidates: Array<{ content: { parts: Array<{ text?: string }> } }> }).candidates[0]!.content.parts.map((x) => x.text ?? '').join('');
          const j = JSON.parse(txt) as { scope?: unknown[]; other_canvases?: Array<{ group?: string } | string> };
          raw = { scope: (j.scope ?? []).length, others: (j.other_canvases ?? []).map((o) => (typeof o === 'string' ? o : o.group ?? '')) };
        } catch { raw = null; }
        return r;
      };
      const mk = (calls: typeof call1) => ({ rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: { status: 'ok' }, error: null }; }, model, readLink: async () => ({ ok: false, reason: 'unreachable' }) });
      const first = { status: 'run', run_id: 'j9-1', kind: 'message', first_draft: true, reserved_usd: 0.27, base_label: null, focus: null, draft_points: [], material: [], other_names: [], thread: [{ kind: 'owner_message', text: base.text, is_trigger: true, message_id: 'm1' }] };
      await quiet(() => executeRun(mk(call1), { ownerId: 'eval-owner' }, first));
      const d1 = call1.find((c) => c.name === '_canvas_draft_run_complete')?.args;
      if (!d1) { rows.push({ pair: pair.id, run: n, firstFailed: true }); continue; }
      usd += Number(d1.p_usd ?? 0);
      const points = ((d1.p_actions as Array<{ action: string; box?: string; statement?: string }>) ?? []).filter((a) => a.action === 'new').map((a, i) => ({ id: `p${i}`, box: a.box!, statement: a.statement! }));
      const focus = (d1.p_focus as string | null) ?? null;
      const offers = ((d1.p_other_canvases as Array<{ group: string }>) ?? []).map((o, i) => ({ id: `o${i}`, group_label: o.group, state: 'offered' }));
      const call2: typeof call1 = [];
      const second = {
        status: 'run', run_id: 'j9-2', kind: 'message', first_draft: false, reserved_usd: 0.27, base_label: null, focus, input_kind: 'file', offers,
        draft_points: points, other_names: [],
        material: [{ id: 'f1', kind: 'file', label: `${pair.id}.md`, text: pair.file, message_id: 'm2' }],
        thread: [{ kind: 'owner_message', text: base.text, message_id: 'm1' }, { kind: 'owner_message', text: `${pair.id}.md`, is_trigger: true, message_id: 'm2' }],
      };
      raw = null;
      await quiet(() => executeRun(mk(call2), { ownerId: 'eval-owner' }, second));
      const rawSecond = raw as { scope: number; others: string[] } | null;
      const d2 = call2.find((c) => c.name === '_canvas_draft_run_complete')?.args;
      const f2 = call2.find((c) => c.name === '_canvas_draft_run_fail')?.args;
      usd += Number((d2 ?? f2)?.p_usd ?? (f2 as { p_actual_usd?: number } | undefined)?.p_actual_usd ?? 0);
      const acts = ((d2?.p_actions as Array<{ action: string; box?: string; statement?: string }>) ?? []).filter((a) => a.action !== 'keep');
      const persisted = ((d2?.p_other_canvases as Array<{ group: string }>) ?? []).map((o) => o.group);
      // The database part is stubbed here: for an upload on an empty scope the migration writes the J9 line from the offers it inserts. This mirrors that line
      // (the same words) so the first line shown is what the owner would read; the engine's own reply for that run carries no J9 line.
      const joined = persisted.length < 2 ? persisted[0] ?? '' : `${persisted.slice(0, -1).join(', ')} and ${persisted[persisted.length - 1]}`;
      const dbLine = d2 && ((d2.p_scope as unknown[]) ?? []).length === 0 && persisted.length ? `Your new file is also about ${joined}.${focus ? ` This canvas stays about ${focus}.` : ''}` : '';
      const reply = dbLine ? `${dbLine}\n${String(d2?.p_reply ?? '')}` : String(d2?.p_reply ?? f2?.p_reply ?? '');
      rows.push({
        pair: pair.id, kind: pair.kind, run: n, focus, modelScope: rawSecond?.scope ?? null, modelOthers: rawSecond?.others ?? null, secondDone: !!d2, reported: ((d2?.p_other_canvases as unknown[]) ?? []).length,
        groups: ((d2?.p_other_canvases as Array<{ group: string }>) ?? []).map((o) => o.group), firstLine: reply.split('\n')[0], focusMoved: d2?.p_focus != null,
        scope: ((d2?.p_scope as string[]) ?? []).length, customerBoxPointsAboutOther: acts.filter((a) => a.box && customer.has(a.box) && pair.mention.test(a.statement ?? '')).length,
        customerBoxesTouched: acts.filter((a) => a.box && customer.has(a.box)).length,
      });
      console.error(`${pair.id}#${n} second=${d2 ? 'done' : 'failed'} reported=${((d2?.p_other_canvases as unknown[]) ?? []).length} line=${reply.split('\n')[0].slice(0, 90)}`);
    }
  }
  if (out) writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const by = (k: string) => rows.filter((r) => r.kind === k);
  const rate = (rs: Array<Record<string, unknown>>) => `${rs.filter((r) => Number(r.reported) > 0).length}/${rs.length}`;
  console.log(JSON.stringify({
    pairs: rows.length, firstRunFailed: rows.filter((r) => r.firstFailed).length, reportedOtherGroup: rate(by('other-group')), reportedSameGroup: rate(by('same-group')), reportedHelper: rate(by('helper')),
    modelNamedOtherGroup: rows.filter((r) => ((r.modelOthers as string[] | null) ?? []).length > 0).length, modelEmptyScope: rows.filter((r) => r.modelScope === 0).length,
    modelNamedByKind: Object.fromEntries(['other-group', 'same-group', 'helper'].map((k) => [k, `${by(k).filter((r) => ((r.modelOthers as string[] | null) ?? []).length > 0).length}/${by(k).length}`])),
    j9LineOnReported: rows.filter((r) => /^Your new file is also about/.test(String(r.firstLine))).length, focusMoved: rows.filter((r) => r.focusMoved).length,
    customerPointsAboutOtherGroup: rows.reduce((t, r) => t + Number(r.customerBoxPointsAboutOther ?? 0), 0), usdTotal: Number(usd.toFixed(4)),
  }, null, 1));
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

/** Every value in the prod env file: the explicit EVAL_PROD_ENV_FILE, else the nearest `.env.prod` above the cwd (a worktree sits three levels under the repo root). */
function prodEnvValues(): string[] {
  const explicit = process.env.EVAL_PROD_ENV_FILE;
  if (explicit) return existsSync(explicit) ? envFileValues(readFileSync(explicit, 'utf8')) : [];
  for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
    const f = join(dir, '.env.prod');
    if (existsSync(f)) return envFileValues(readFileSync(f, 'utf8'));
  }
  return [];
}

async function main(): Promise<void> {
  const key = process.env.EVAL_GEMINI_KEY ?? '';
  const shared = resolve(arg('shared', 'supabase/functions/_shared')!);
  const out = arg('out');
  const repeat = Number(arg('repeat', '1'));
  const only = arg('packs')?.split(',');
  const load = (f: string) => import(`${shared}/${f}.ts`);
  const [{ executeRun }, { geminiCaller }, { checkEvalPoints, segmentSpecificity }] = await Promise.all([load('canvas-run'), load('canvas-model'), import(resolve('supabase/functions/_shared/canvas-eval-rules.ts'))]);
  const rejudge = arg('rejudge');
  if (rejudge) {
    // Judge points a past run wrote with the CURRENT rules, so a checker fix is compared on the same model output, not on a new sample.
    const past = readFileSync(rejudge, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as RunRow).filter((r) => r.state === 'done' && (!only || only.includes(r.pack)));
    let segs = 0; let pass = 0; const rules: Record<string, number> = {};
    for (const r of past) {
      const text = PACKS.find((p) => p.id === r.pack)!.text;
      for (const v of checkEvalPoints(r.points, text)) rules[v.rule] = (rules[v.rule] ?? 0) + 1;
      for (const p of r.points.filter((x) => x.box === 'canvas:segments')) { segs += 1; if (segmentSpecificity(p.text).ok) pass += 1; }
    }
    console.log(JSON.stringify({ rejudged: rejudge, runs: past.length, segmentPoints: segs, segmentQ1Pass: pass, violationsByRule: rules }, null, 1));
    return;
  }
  const refusal = refuseNonTest({ key, env: process.env, prodValues: prodEnvValues() });
  if (refusal) { console.error(refusal); process.exit(2); }
  if (process.argv.includes('--j9')) { await runJ9(load, key, repeat, out); return; }
  if (out) writeFileSync(out, '');

  const rows: RunRow[] = [];
  for (const pack of PACKS.filter((p) => !only || only.includes(p.id))) {
    for (let n = 1; n <= repeat; n++) {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      let droppedLog: number | null = null;
      const origLog = console.log;
      console.log = (...a: unknown[]) => { const o = a[1] as { dropped?: number } | undefined; if (a[0] === 'canvas-draft: done' && o) droppedLog = o.dropped ?? null; };
      const run = {
        status: 'run', run_id: 'eval', kind: 'message', first_draft: true, reserved_usd: 0.27, base_label: null, focus: null, draft_points: [], material: [], other_names: [],
        thread: [{ kind: 'owner_message', text: pack.text, is_trigger: true, message_id: 'm1' }],
      };
      const deps = {
        rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: { status: 'ok' }, error: null }; },
        model: geminiCaller(key),
        readLink: async () => ({ ok: false, reason: 'unreachable' }),
      };
      const summary = await executeRun(deps, { ownerId: 'eval-owner' }, run);
      console.log = origLog;
      const done = calls.find((c) => c.name === '_canvas_draft_run_complete')?.args;
      const failed = calls.find((c) => c.name === '_canvas_draft_run_fail')?.args;
      const actions = ((done?.p_actions ?? []) as Array<{ action: string; box?: string; statement?: string }>).filter((a) => a.action === 'new' && a.box && a.statement);
      const points = actions.map((a) => ({ box: a.box!, text: a.statement! }));
      const row: RunRow = {
        pack: pack.id, run: n, state: summary.state, code: summary.code, usd: ((done ?? failed)?.p_usd ?? (failed as { p_actual_usd?: number } | undefined)?.p_actual_usd ?? null) as number | null,
        points, reply: (done?.p_reply ?? failed?.p_reply ?? null) as string | null, focus: (done?.p_focus ?? null) as string | null,
        focusReason: null, offers: ((done?.p_other_canvases ?? []) as Array<{ group: string }>).map((o) => o.group),
        violations: checkEvalPoints(points, pack.text),
        segments: points.filter((p) => p.box === 'canvas:segments').map((p) => { const q = segmentSpecificity(p.text); return { text: p.text, ok: q.ok, missing: q.missing }; }),
        dropped: droppedLog, scope: ((done?.p_scope ?? []) as unknown[]).length,
      };
      rows.push(row);
      if (out) appendFileSync(out, `${JSON.stringify(row)}\n`);
      console.error(`${pack.id}#${n} ${row.state}${row.code ? `:${row.code}` : ''} points=${points.length} viol=${row.violations.length} offers=${row.offers.length} usd=${row.usd}`);
    }
  }

  const ok = rows.filter((r) => r.state === 'done');
  const segs = ok.flatMap((r) => r.segments);
  const rules = new Map<string, number>();
  for (const r of ok) for (const v of r.violations) rules.set(v.rule, (rules.get(v.rule) ?? 0) + 1);
  const total = rows.reduce((s, r) => s + (r.usd ?? 0), 0);
  console.log(JSON.stringify({
    shared, runs: rows.length, done: ok.length, failed: rows.length - ok.length, points: ok.reduce((s, r) => s + r.points.length, 0),
    segmentPoints: segs.length, segmentQ1Pass: segs.filter((s) => s.ok).length, violationsByRule: Object.fromEntries(rules), usdTotal: Number(total.toFixed(4)),
    offers: rows.map((r) => `${r.pack}:${r.offers.length}`).join(' '),
  }, null, 1));
}

main().catch((e) => { console.error('eval crashed:', (e as Error).name); process.exit(1); });
