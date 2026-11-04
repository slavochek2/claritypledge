/**
 * P1604 (founder-approved interim): a Clarified SESSION thread fits a 3-hour session for the mirror agent. A copied session-thread item
 * is capped at 60,000 tokens, the whole request at 100,000 and the output at 4,000, ONLY when such an item is in the request; every other
 * chat keeps 50,000 / 10,000 / 1,200. The cost reservation uses the same numbers in code and SQL, so the bound stays true.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUDGET_TOKENS, COPY_ITEM_TOKENS, MAX_OUT_TOKENS, PRICE_IN_PER_M, PRICE_OUT_PER_M, RESERVE_MARGIN,
  SESSION_BUDGET_TOKENS, SESSION_COPY_ITEM_TOKENS, SESSION_MAX_OUT_TOKENS,
  buildMirrorRequest, fitMirrorRequest, itemTokens, requestTokens, reserveReplyUsd, limitsFor,
  type BeginRun, type ContextItem,
} from '../../supabase/functions/_shared/mirror-agent';
import { newestMigrationDefining } from './helpers/newest-migration';

const line = (i: number, words = 25) => ({ name: i % 2 ? 'Bo' : 'Ada', body: `line ${i} ` + 'word '.repeat(words) });
const sessionRun = (rows: number, over: Partial<BeginRun> = {}): BeginRun => ({
  status: 'run', kind: 'reply', owner_id: 'u', mirror_name: null, owner_first_name: 'Test', channel_title: null, question: null,
  session: true, reserved_usd: 0.225, attempt: 1,
  context: [{
    who: 'owner', body: 'what happened?',
    clarify: { from: 'the thread', in: 'Bo', body: 'last line', session_thread: true, thread: Array.from({ length: rows }, (_, i) => line(i)), thread_total: rows },
  }],
  ...over,
});
const ordinaryRun = (rows: number): BeginRun => {
  const r = sessionRun(rows, { session: undefined, reserved_usd: 0.105 });
  (r.context[0]!.clarify as NonNullable<ContextItem['clarify']>).session_thread = false;
  return r;
};

describe('the numbers', () => {
  it('standard is unchanged; the session profile is 100,000 / 60,000 / 4,000', () => {
    expect([BUDGET_TOKENS, COPY_ITEM_TOKENS, MAX_OUT_TOKENS]).toEqual([50_000, 10_000, 1_200]);
    expect([SESSION_BUDGET_TOKENS, SESSION_COPY_ITEM_TOKENS, SESSION_MAX_OUT_TOKENS]).toEqual([100_000, 60_000, 4_000]);
    expect(limitsFor(ordinaryRun(3))).toEqual({ budget: 50_000, copyItem: 10_000, maxOut: 1_200 });
    expect(limitsFor(sessionRun(3))).toEqual({ budget: 100_000, copyItem: 60_000, maxOut: 4_000 });
  });

  it('the reservation: standard $0.105, session $0.225 — the same formula over each profile\'s numbers', () => {
    expect(reserveReplyUsd()).toBe(0.105);
    expect(reserveReplyUsd(true)).toBe(0.225);
    expect(((SESSION_BUDGET_TOKENS * PRICE_IN_PER_M + SESSION_MAX_OUT_TOKENS * PRICE_OUT_PER_M) / 1e6) * RESERVE_MARGIN).toBeCloseTo(0.225, 9);
  });

  it('SQL and code never drift: _mirror_limits() carries both reservations, equal to the code\'s', () => {
    const sql = readFileSync(newestMigrationDefining('FUNCTION public._mirror_limits()'), 'utf8');
    expect(Number(/'reply_max_usd',\s*([0-9.]+)/.exec(sql)![1])).toBe(reserveReplyUsd());
    expect(Number(/'reply_session_max_usd',\s*([0-9.]+)/.exec(sql)![1])).toBe(reserveReplyUsd(true));
  });
});

describe('rebase onto main: _mirror_limits() keeps main\'s canvas caps and adds only the session reservation', () => {
  const body = (f: string) => {
    const sql = readFileSync(resolve(__dirname, '../../supabase/migrations', f), 'utf8');
    const i = sql.indexOf('CREATE OR REPLACE FUNCTION public._mirror_limits()');
    return sql.slice(i, sql.indexOf('\n$$;', i));
  };
  const strip = (b: string) => b.split('\n').filter((l) => !/reply_session_max_usd|P1604: a Clarified session thread/.test(l)).join('\n');
  it('the newest definition is main\'s newest body (P1536 v6) plus exactly the session key, canvas caps included', () => {
    const mine = body('20261105000000_p1604_mirror_limits_with_canvas.sql');
    expect(strip(mine)).toBe(body('20261030080000_p1536_v6_engine.sql'));
    expect(mine).toContain("'reply_session_max_usd',     0.225");
    for (const key of ['canvas_max_usd', 'extract_max_usd', 'person_canvas_daily_usd', 'global_canvas_daily_usd']) expect(mine).toContain(`'${key}'`);
  });
  it('control: the earlier P1604 body (written from the P1547 one) did NOT carry them, which is why the restore exists', () => {
    expect(body('20261104150000_p1604_mirror_session_transcript.sql')).not.toContain('canvas_max_usd');
  });
});

describe('a session item gets the session profile; everything else keeps today\'s', () => {
  it('a session copy that is 10x the ordinary cap fits whole, where the same rows in an ordinary chat are cut to the ordinary cap', () => {
    const ordinary = buildMirrorRequest(ordinaryRun(400));
    expect(ordinary.generationConfig.maxOutputTokens).toBe(1_200);
    expect(requestTokens(ordinary)).toBeLessThanOrEqual(BUDGET_TOKENS);
    expect(ordinary.contents[0]!.parts[0]!.text, 'an ordinary 400-line copy is cut and says so').toContain('showing the last');

    const session = buildMirrorRequest(sessionRun(400));
    expect(session.generationConfig.maxOutputTokens).toBe(4_000);
    const text = session.contents[0]!.parts[0]!.text;
    expect(text, 'all 400 lines are there, the first and the last').toContain('line 0 ');
    expect(text).toContain('line 399 ');
    expect(text, 'nothing cut, so no note').not.toContain('showing the last');
    expect(requestTokens(session)).toBeLessThanOrEqual(SESSION_BUDGET_TOKENS);
  });

  it('a session item is capped at about 60,000 tokens: past it the OLDEST lines go, and the note says how many of how many', () => {
    const req = buildMirrorRequest(sessionRun(2_000));
    const row = copyLine(req)!;
    const copy = JSON.parse(row).copied_for_clarify as { thread: Array<{ text: string }>; thread_note?: string };
    const kept = copy.thread.length;
    expect(itemTokens(JSON.parse(row))).toBeLessThanOrEqual(SESSION_COPY_ITEM_TOKENS);
    expect(kept).toBeLessThan(2_000);
    expect(kept, 'far more than the ordinary cap keeps').toBeGreaterThan(COPY_ITEM_TOKENS / 20);
    expect(copy.thread_note).toBe(`showing the last ${kept} of 2000 replies`);
    expect(copy.thread.at(-1)!.text).toContain('line 1999 ');
  });

  it('the whole request, built through the final fit, stays inside 100,000 whatever the model counts at most', async () => {
    const { request, tokens } = await fitMirrorRequest(sessionRun(2_000), async () => null);
    expect(tokens).toBeLessThanOrEqual(SESSION_BUDGET_TOKENS);
    expect(requestTokens(request)).toBeLessThanOrEqual(SESSION_BUDGET_TOKENS);
  });

  it('a session run is the only one that gets 100,000: the same rows with session off (control)', async () => {
    const { tokens } = await fitMirrorRequest(ordinaryRun(2_000), async () => null);
    expect(tokens).toBeLessThanOrEqual(BUDGET_TOKENS);
  });

  it('a second, ordinary copy in a session request keeps the ordinary 10,000-token cap', () => {
    const run = sessionRun(50);
    run.context.unshift({ who: 'owner', body: 'older', clarify: { from: 'x', in: 'y', body: 'z', session_thread: false, thread: Array.from({ length: 600 }, (_, i) => line(i)), thread_total: 600 } });
    const req = buildMirrorRequest(run);
    const dataLines = req.contents[0]!.parts[0]!.text.split('\n').filter((l) => l.includes('copied_for_clarify'));
    const ordinaryLine = dataLines.find((l) => l.includes('"older"') || l.includes('older'));
    expect(ordinaryLine && ordinaryLine.length / 3, 'the ordinary copy is cut to its own cap').toBeLessThan(COPY_ITEM_TOKENS * 1.5);
  });
});

/** The data line carrying the copied thread, as sent to the model. */
function copyLine(req: ReturnType<typeof buildMirrorRequest>): string | undefined {
  return req.contents[0]!.parts[0]!.text.split('\n').find((l) => l.includes('copied_for_clarify'));
}
