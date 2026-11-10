/**
 * P1653 (server): a run that gets nothing to write asks its follow-up as a finished run (F1, F5), the redirect-page question and its two fixed buttons (F2),
 * the approved words of every failure the run produces, and the migration that backs them. The model and the database are faked; the words are the
 * founder-approved ones in canvas-reply-table.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOX_DEFINITIONS } from '../../supabase/functions/_shared/canvas-box-definitions';
import { DRAFT_RULES } from '../../supabase/functions/_shared/canvas-prompt';
import { executeRun, type CanvasRun, type RpcResult, type RunDeps } from '../../supabase/functions/_shared/canvas-run';
import { handleUpload, type HandlerCtx } from '../../supabase/functions/_shared/canvas-handlers';
import { PAGE_BUTTONS, WORDS, pageButtonsFor } from '../../supabase/functions/_shared/canvas-reply-table';
import { stubCaller } from '../../supabase/functions/_shared/canvas-model';
import { boxVocabulary } from '../../supabase/functions/_shared/canvas-nothing';
import { contentWords } from '../../supabase/functions/_shared/canvas-support';
import type { GeminiRequest } from '../../supabase/functions/_shared/mirror-agent';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const TAGS = BOX_DEFINITIONS.map((b) => b.tag);
const [SEGMENTS] = TAGS as [string];
const gemini = (obj: unknown) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 } });
const answering = (obj: Record<string, unknown>): RunDeps['model'] => async () => ({ response: gemini({ scope: TAGS, actions: [], ...obj }), status: 200 });
const text = (r: GeminiRequest) => r.contents[0]!.parts[0]!.text;
const PAGE = { id: 'mat1', kind: 'link' as const, label: 'https://airbnb.com', text: 'Redirecting to www.airbnb.com.sg' };

type RpcFake = (name: string, args: Record<string, unknown>) => RpcResult | undefined;
const pageButtonsOf = (t: unknown) => (t === PAGE_BUTTONS.yes.token || t === PAGE_BUTTONS.no.token ? t : null);
const REDIRECT_REPLY =`${WORDS.redirectPage('airbnb.com')}\n${WORDS.pageQuestion}`;
type LinkRead = Awaited<ReturnType<RunDeps['readLink']>>;
/** `marked`: which thread messages carry the client's tap marker. Default: every message whose text equals a token (a real tap). `[]`: all of them are typed words. */
function harness(over: Partial<CanvasRun> & { trigger?: string | null; earlier?: string[]; newest?: string | null; read?: LinkRead; marked?: string[]; ownerAfter?: boolean; params?: { extraUsd?: number } } = {}, model?: RunDeps['model'], rpcFake?: RpcFake) {
  const { trigger = 'its a car selling business', earlier = [], newest = REDIRECT_REPLY, read = { ok: false, reason: 'unreachable' } as LinkRead, marked, ownerAfter = false, params = {}, ...rest } = over;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const requests: GeminiRequest[] = [];
  const reads: string[] = [];
  const run: CanvasRun = {
    status: 'run', run_id: 'run-1', kind: 'message', first_draft: true, reserved_usd: 0.27, base_label: null, focus: null,
    draft_points: [], material: [], other_names: [],
    thread: [
      ...earlier.map((t, i) => ({ kind: 'owner_message' as const, text: t, message_id: `e${i}` })),
      ...(trigger ? [{ kind: 'owner_message' as const, text: trigger, is_trigger: true, message_id: 'm1' }] : []),
    ],
    ...rest,
  };
  const deps: RunDeps = {
    rpc: async (name, args): Promise<RpcResult> => {
      calls.push({ name, args });
      const faked = rpcFake?.(name, args);
      if (faked) return faked;
      if (name === '_canvas_draft_tap_state') { // what the database says: the marked taps, the newest agent reply before this run's message, whether anyone wrote since
        const ids = marked ?? run.thread.filter((t) => pageButtonsOf(t.text)).map((t) => String(t.message_id));
        return { data: { taps: ids, newest_reply: newest, owner_after: ownerAfter }, error: null };
      }
      return { data: { status: 'ok' }, error: null };
    },
    model: async (c) => { requests.push(c.request as GeminiRequest); return model ? model(c) : stubCaller()(c); },
    readLink: async (url) => { reads.push(url); return read; },
  };
  const by = (n: string) => calls.find((c) => c.name === n)?.args;
  return {
    calls, requests, reads, run, deps, params: { ownerId: 'owner-1', ...params }, by,
    names: () => calls.map((c) => c.name),
    asked: () => by('_canvas_draft_run_complete_question'), done: () => by('_canvas_draft_run_complete'), failed: () => by('_canvas_draft_run_fail'),
  };
}

describe('P1653 F5 + F1: a first draft the model wrote nothing for asks a follow-up as a finished run', () => {
  it('shows the model\'s own question when every content word of it is in the owner\'s message, and completes with no Undo step', async () => {
    const h = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Who is your car selling business for?' }] }));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    expect(String(h.asked()!.p_reply)).toBe('Nothing changed on the canvas.\nWho is your car selling business for?');
    expect(h.names()).not.toContain('_canvas_draft_run_complete'); // that function inserts the Undo step on an empty first draft
    expect(h.names()).not.toContain('_canvas_draft_run_fail');
  });
  it('shows the fixed question when the model\'s question holds a word the owner never said', async () => {
    const h = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Which dealership customers do you serve?' }] }));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
  it('shows the fixed question when the model asked nothing (the module\'s own box questions are never promoted)', async () => {
    const h = harness({}, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
  it('a question may name its box: box vocabulary plus the owner\'s words passes; one fact word the owner never said falls back', async () => {
    const ok = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Who are the customer segments of your car selling business?' }] }));
    await executeRun(ok.deps, ok.params, ok.run);
    expect(String(ok.asked()!.p_reply)).toBe('Nothing changed on the canvas.\nWho are the customer segments of your car selling business?');
    for (const fact of ['families', 'Tesla']) {
      const bad = harness({}, answering({ questions: [{ box: SEGMENTS, question: `Are ${fact} the customer segments of your car selling business?` }] }));
      await executeRun(bad.deps, bad.params, bad.run);
      expect(String(bad.asked()!.p_reply), fact).toBe(WORDS.fallbackQuestion);
    }
  });
  it('the exemption is the nine box titles only: definition words carry no weight (a question of definition words alone falls back)', async () => {
    for (const q of ['Do partners refer and renew?', 'Do customers pay per unit, and do partners renew?']) {
      const h = harness({}, answering({ questions: [{ box: SEGMENTS, question: q }] }));
      await executeRun(h.deps, h.params, h.run);
      expect(String(h.asked()!.p_reply), q).toBe(WORDS.fallbackQuestion);
    }
    const vocab = boxVocabulary();
    for (const b of BOX_DEFINITIONS) for (const w of contentWords(b.title)) expect(vocab.has(w), `${b.title}: ${w}`).toBe(true);
    expect([...vocab].sort()).toEqual([...contentWords(BOX_DEFINITIONS.map((b) => b.title).join(' '))].sort());
  });
  it('the box vocabulary is derived from the box definitions: a changed title flows through', async () => {
    const defs = BOX_DEFINITIONS as unknown as Array<{ title: string }>;
    const original = defs[0]!.title;
    const ask = async () => { const h = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Is zebra crossing about your car selling business?' }] })); await executeRun(h.deps, h.params, h.run); return String(h.asked()!.p_reply); };
    expect(await ask()).toBe(WORDS.fallbackQuestion); // control: "zebra" is nowhere yet
    try { defs[0]!.title = 'Zebra Crossing'; expect(await ask()).toBe('Nothing changed on the canvas.\nIs zebra crossing about your car selling business?'); }
    finally { defs[0]!.title = original; }
  });
  it('applies the names screen and the numbers rule to the question', async () => {
    const named = harness({ trigger: 'its a car selling business', other_names: ['Bob Marley'] }, answering({ questions: [{ box: SEGMENTS, question: 'Does Bob Marley buy from your car selling business?' }] }));
    await executeRun(named.deps, named.params, named.run);
    expect(String(named.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
    const num = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Is your car selling business 5 years old?' }] }));
    await executeRun(num.deps, num.params, num.run);
    expect(String(num.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
  it('takes the first of the model\'s questions that passes, in the order it wrote them', async () => {
    const h = harness({}, answering({ questions: [{ box: SEGMENTS, question: 'Which dealership customers do you serve?' }, { box: SEGMENTS, question: 'What is your car selling business about?' }] }));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe('Nothing changed on the canvas.\nWhat is your car selling business about?');
  });
  it('a refused message is still not remembered: a run that failed the evidence check fails, and asks nothing', async () => {
    const bad = { action: 'new', box: SEGMENTS, statement: 'Families who buy used cars', quote: 'nothing of the kind is in the message' };
    const h = harness({}, answering({ actions: [bad] }));
    await executeRun(h.deps, h.params, h.run);
    expect(h.failed()).toMatchObject({ p_code: 'nothing_supported', p_reply: WORDS.evidence });
    expect(h.asked()).toBeUndefined();
  });
  it('a run that is not a first draft message keeps failing as before (focus and fork runs have no message to ask about)', async () => {
    const h = harness({ kind: 'focus', target_group: 'x', draft_points: [] } as Partial<CanvasRun>, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.failed()).toMatchObject({ p_code: 'nothing_supported', p_reply: WORDS.fallbackQuestion });
  });
  it('the cut note and the usd settled are carried: no model cost beyond the call itself', async () => {
    const h = harness({}, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(typeof h.asked()!.p_usd).toBe('number');
  });
});

describe('P1653 F1: the answer run is a first draft and uses both messages', () => {
  it('the second message runs with all nine boxes, accepts the focus, and the first message is in its input', async () => {
    const model = answering({
      focus: 'Used car buyers',
      actions: [{ action: 'new', box: SEGMENTS, statement: 'Families buying used cars', quote: 'used cars to families' }],
    });
    const h = harness({ trigger: 'We sell used cars to families, with a warranty', earlier: ['its a car selling business'] }, model);
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    expect(text(h.requests[0]!)).toContain('its a car selling business');
    expect(text(h.requests[0]!)).toContain('all nine boxes');
    expect(h.done()!.p_focus).toBe('Used car buyers');
    expect(h.done()!.p_actions).toHaveLength(1);
  });
});

describe('P1653 F2: a link that came back as a redirect notice', () => {
  const links = { material: [PAGE], trigger: 'airbnb.com - make canvas' } as Partial<CanvasRun> & { trigger: string };
  const fresh = { read: { ok: true, text: PAGE.text } as LinkRead, trigger: 'airbnb.com - make canvas' };
  it('says what it read and asks "Is this your business?", and the reply carries the two buttons', async () => {
    const h = harness(fresh, answering({}));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    const reply = String(h.asked()!.p_reply);
    expect(reply).toBe('I could only read a redirect page from airbnb.com.\nIs this your business?');
    expect(pageButtonsFor(reply)).toBe(PAGE_BUTTONS);
    expect(h.names()).not.toContain('_canvas_draft_run_fail');
  });
  it('"Not mine" removes that page from the draft\'s material, asks what the business does, and calls no model', async () => {
    const h = harness({ material: [PAGE, { id: 'mat2', kind: 'link', label: 'https://real.example.com', text: 'We sell used cars to families in Riga and give a warranty on every car.' }], trigger: PAGE_BUTTONS.no.token, earlier: ['airbnb.com - make canvas'] }, answering({}));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'done' });
    expect(h.by('_canvas_draft_remove_material')).toMatchObject({ p_ids: ['mat1'] }); // the thin page only, never a real one
    expect(String(h.asked()!.p_reply)).toBe(WORDS.notMine);
    expect(h.requests).toHaveLength(0);
  });
  it('a later run does not include the page\'s words, nor the tap, once the page is gone from the material', async () => {
    const h = harness({ material: [], trigger: 'We sell used cars to families, with a warranty', earlier: ['airbnb.com - make canvas', PAGE_BUTTONS.no.token] }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(text(h.requests[0]!)).not.toContain('Redirecting');
    expect(text(h.requests[0]!)).not.toContain(PAGE_BUTTONS.no.token);
  });
  it('"Yes" goes on to the draft without the tap in the material, and does not ask the redirect question again', async () => {
    const h = harness({ ...links, trigger: PAGE_BUTTONS.yes.token }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.requests).toHaveLength(1);
    expect(text(h.requests[0]!)).not.toContain(PAGE_BUTTONS.yes.token);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
  it('a tap adds no evidence word: a point resting only on the tap\'s words is refused', async () => {
    const page = { ...PAGE, text: 'We sell used cars to families in Riga and give a warranty on every car.' };
    const point = { action: 'new', box: SEGMENTS, statement: 'My business', quote: PAGE_BUTTONS.yes.token }; // would pass as a best guess if the tap were the owner's words
    const h = harness({ material: [page], trigger: PAGE_BUTTONS.yes.token }, answering({ actions: [point] }));
    await executeRun(h.deps, h.params, h.run);
    expect(h.done()).toBeUndefined();
    expect(h.failed()).toMatchObject({ p_code: 'nothing_supported' });
  });
  it('a stale tap (the newest reply is no longer the question) says so, changes nothing, uses no update and settles no model cost', async () => {
    for (const trigger of [PAGE_BUTTONS.no.token, PAGE_BUTTONS.yes.token]) {
      const h = harness({ ...links, trigger, newest: 'Draft ready: 4 of 9 boxes.' }, answering({}));
      expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'failed', code: 'stale_button' });
      expect(h.failed()).toMatchObject({ p_code: 'stale_button', p_reply: WORDS.staleButton, p_actual_usd: 0 });
      expect(h.names()).not.toContain('_canvas_draft_run_complete_question'); // a finished run would count 1 of the 30
      expect(h.names()).not.toContain('_canvas_draft_remove_material');
      expect(h.requests).toHaveLength(0);
    }
  });
  it('a tap with no earlier agent reply at all is stale too', async () => {
    const h = harness({ ...links, trigger: PAGE_BUTTONS.no.token, newest: null }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.failed()).toMatchObject({ p_code: 'stale_button' });
  });
  it('a failed lookup of the tap state fails the run as internal (Try again works), never a tap and never a stale reply', async () => {
    const h = harness({ ...links, trigger: PAGE_BUTTONS.no.token }, answering({}), (n) => (n === '_canvas_draft_tap_state' ? { data: null, error: { code: 'x' } } : undefined));
    await executeRun(h.deps, h.params, h.run);
    expect(h.failed()).toMatchObject({ p_code: 'internal', p_reply: WORDS.internal });
    expect(h.names()).not.toContain('_canvas_draft_remove_material');
  });
  it('typed words equal to a button label are ALWAYS an ordinary owner message: no marker, no tap, never stale, remembered and used as material', async () => {
    for (const first_draft of [true, false]) {
      for (const token of [PAGE_BUTTONS.no.token, PAGE_BUTTONS.yes.token]) {
        const h = harness({ trigger: token, marked: [], first_draft, focus: first_draft ? null : 'used car buyers', draft_points: first_draft ? [] : [{ id: 'p1', box: SEGMENTS, statement: 'Families buying used cars' }], newest: 'Draft ready: 4 of 9 boxes.' }, answering({ scope: [] }));
        await executeRun(h.deps, h.params, h.run);
        expect(h.failed()?.p_code, `${token} first_draft=${first_draft}`).not.toBe('stale_button');
        expect(h.names()).not.toContain('_canvas_draft_remove_material');
        expect(h.requests).toHaveLength(1);
        expect(text(h.requests[0]!)).toContain(token); // the owner's own words, in the material
      }
    }
  });
  it('an earlier typed message equal to a label stays in later runs; an earlier MARKED tap does not', async () => {
    const h = harness({ trigger: 'We sell used cars to families', earlier: [PAGE_BUTTONS.no.token, PAGE_BUTTONS.yes.token], marked: ['e1'] }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(text(h.requests[0]!)).toContain(PAGE_BUTTONS.no.token); // e0: typed, remembered
    expect(text(h.requests[0]!)).not.toContain(PAGE_BUTTONS.yes.token); // e1: a real tap, never material
  });
  it('a tap counts only if nobody wrote in the thread between the question and the tap: otherwise stale', async () => {
    const h = harness({ ...links, trigger: PAGE_BUTTONS.no.token, ownerAfter: true }, answering({}));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'failed', code: 'stale_button' });
    expect(h.names()).not.toContain('_canvas_draft_remove_material');
    expect(h.requests).toHaveLength(0);
  });
  it('the stale check runs before any page is read, and a stale tap settles through the ledger like every other early exit', async () => {
    const h = harness({ ...links, trigger: PAGE_BUTTONS.no.token, newest: 'Draft ready: 4 of 9 boxes.', read: { ok: true, text: PAGE.text }, params: { extraUsd: 0.05 } }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.names()[0]).toBe('_canvas_draft_tap_state'); // before anything else, gatherLinks included
    expect(h.reads).toEqual([]);
    expect(h.failed()).toMatchObject({ p_code: 'stale_button', p_actual_usd: 0.05 });
  });
  it('"Yes" does not make the next thin message ask the same question again for the same page (no loop)', async () => {
    const h = harness({ material: [PAGE], trigger: 'ok so what now', earlier: ['airbnb.com - make canvas', PAGE_BUTTONS.yes.token] }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
    const again = harness({ material: [PAGE], trigger: 'airbnb.com - make canvas', read: { ok: true, text: PAGE.text } }, answering({}));
    await executeRun(again.deps, again.params, again.run);
    expect(String(again.asked()!.p_reply)).toBe(WORDS.fallbackQuestion); // the page is known: not read now, so not asked about now
    expect(again.reads).toEqual([]);
  });
  it('every spelling of the rejected page stays rejected: Airbnb.com, www.airbnb.com, https://airbnb.com/ and a 250-character URL against its 200-character label', async () => {
    const tomb = { id: 'mat1', kind: 'link_rejected' as const, label: 'https://airbnb.com', text: '' };
    for (const said of ['Airbnb.com is a platform I list on', 'see www.airbnb.com please', 'https://airbnb.com/ again', 'https://www.Airbnb.com/']) {
      const h = harness({ material: [tomb], trigger: said, read: { ok: true, text: PAGE.text } }, answering({}));
      await executeRun(h.deps, h.params, h.run);
      expect(h.reads, said).toEqual([]);
      expect(String(h.asked()!.p_reply), said).toBe(WORDS.fallbackQuestion);
    }
    for (const label of ['https://www.airbnb.com/', 'https://Airbnb.com', 'https://airbnb.com/']) { // the label as an older run stored it: the same page, written another way
      const stored = harness({ material: [{ id: 'mat1', kind: 'link_rejected', label, text: '' }], trigger: 'airbnb.com - make canvas', read: { ok: true, text: PAGE.text } }, answering({}));
      await executeRun(stored.deps, stored.params, stored.run);
      expect(stored.reads, label).toEqual([]);
    }
    const long = `https://shop.example.com/${'a'.repeat(225)}`; // 250 characters
    expect(long).toHaveLength(250);
    const h = harness({ material: [{ id: 'mat9', kind: 'link_rejected', label: long.slice(0, 200), text: '' }], trigger: `look at ${long}`, read: { ok: true, text: PAGE.text } }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.reads).toEqual([]);
    const other = harness({ material: [tomb], trigger: 'see airbnb.com/rooms/1', read: { ok: true, text: PAGE.text } }, answering({})); // control: another page of the same site is a different page
    await executeRun(other.deps, other.params, other.run);
    expect(other.reads).toEqual(['https://airbnb.com/rooms/1']);
  });
  it('the same page written two ways in one message is read once', async () => {
    const h = harness({ trigger: 'airbnb.com and https://www.airbnb.com/', read: { ok: true, text: 'We run a marketplace for stays and give hosts tools to list them every day.' } }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.reads).toHaveLength(1);
  });
  it('after "Not mine" a retry or a run with no trigger does not read the page again, and does not include it', async () => {
    const tomb = { id: 'mat1', kind: 'link_rejected' as const, label: 'https://airbnb.com', text: '' };
    const retry = harness({ material: [tomb], trigger: 'airbnb.com - make canvas', read: { ok: true, text: PAGE.text } }, answering({}));
    await executeRun(retry.deps, retry.params, retry.run);
    expect(retry.reads).toEqual([]);
    expect(retry.calls.filter((c) => c.name === '_canvas_draft_add_material')).toHaveLength(0);
    expect(String(retry.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
    expect(JSON.stringify(retry.requests[0])).not.toContain('Redirecting');
    const noTrigger = harness({ kind: 'focus', target_group: 'x', trigger: null, earlier: ['airbnb.com - make canvas'], material: [tomb, { id: 'f1', kind: 'file', label: 'a.md', text: 'We sell used cars to families.' }], read: { ok: true, text: PAGE.text } }, answering({}));
    await executeRun(noTrigger.deps, noTrigger.params, noTrigger.run);
    expect(noTrigger.reads).toEqual([]);
    expect(JSON.stringify(noTrigger.requests[0])).not.toContain('Redirecting');
  });
  it('the thin-page decision comes from the text the reader returned, not from the link', async () => {
    const real = { ...PAGE, text: 'We sell used cars to families in Riga and give a warranty on every car.' };
    const h = harness({ material: [real], trigger: 'airbnb.com - make canvas' }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(String(h.asked()!.p_reply)).toBe(WORDS.fallbackQuestion);
  });
});

describe('P1653 every failure a run produces says its own approved words, with its own code', () => {
  const failing = (status: number): RunDeps['model'] => async () => ({ response: null, status });
  const run1 = async (model: RunDeps['model'], over: Partial<CanvasRun> & { trigger?: string | null } = {}) => { const h = harness({ first_draft: false, focus: 'x', ...over }, model); await executeRun(h.deps, h.params, h.run); return h.failed(); };
  it.each([
    [429, 'capped', WORDS.capped], [403, 'capped', WORDS.capped], [500, 'http_500', WORDS.http], [400, 'http_400', WORDS.http], [0, 'network', WORDS.network],
  ])('model status %i is %s', async (status, code, words) => {
    expect(await run1(failing(status))).toMatchObject({ p_code: code, p_reply: words });
  });
  it.each([
    [{ candidates: [{ finishReason: 'SAFETY' }] }, 'blocked', WORDS.blocked],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }] }, 'empty', WORDS.empty],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }, 'unparsable', WORDS.unparsable],
  ])('an unusable answer %# is its own code and words', async (response, code, words) => {
    expect(await run1(async () => ({ response, status: 200 }))).toMatchObject({ p_code: code, p_reply: words });
  });
  it('a message with nothing from the owner to read says so', async () => {
    const h = harness({ trigger: null }, answering({}));
    await executeRun(h.deps, h.params, h.run);
    expect(h.failed()).toMatchObject({ p_code: 'no_readable_material', p_reply: WORDS.nothingFromYou });
  });
  it('a write that fails and a crash say their words', async () => {
    const w = harness({ first_draft: false, focus: 'x', trigger: 'We sell used cars to families with a warranty' },
      answering({ scope: [SEGMENTS], actions: [{ action: 'new', box: SEGMENTS, statement: 'Families buying used cars', quote: 'used cars to families' }] }),
      (n) => (n === '_canvas_draft_run_complete' ? { data: null, error: { code: 'x' } } : undefined));
    await executeRun(w.deps, w.params, w.run);
    expect(w.failed()).toMatchObject({ p_code: 'write', p_reply: WORDS.write });
    const c = harness({ first_draft: false, focus: 'x' }, async () => { throw new Error('boom'); });
    await executeRun(c.deps, c.params, c.run);
    expect(c.failed()).toMatchObject({ p_code: 'internal', p_reply: WORDS.internal });
  });
  it('a focus run whose target is no longer offered gets its words posted (the database failed it without any)', async () => {
    const point = { action: 'new', box: SEGMENTS, statement: 'Families buying used cars', quote: 'used cars to families' };
    const h = harness({ kind: 'focus', target_group: 'used car buyers', trigger: null, material: [{ id: 'f1', kind: 'file', label: 'a.md', text: 'We sell used cars to families with a warranty' }] },
      answering({ actions: [point] }), (n) => (n === '_canvas_draft_run_complete' ? { data: { status: 'failed', code: 'not_offered' }, error: null } : undefined));
    expect(await executeRun(h.deps, h.params, h.run)).toEqual({ state: 'failed', code: 'not_offered' });
    expect(h.by('_canvas_draft_fail_reply')).toMatchObject({ p_run: 'run-1', p_reply: WORDS.notOffered });
  });
});

const fileBytes = new WeakMap<File, Uint8Array>();
const mk = (content: string, name: string, type: string): File => { const f = new File([content], name, { type }); fileBytes.set(f, new TextEncoder().encode(content)); return f; };

describe('P1653 upload failures say their own cause', () => {
  async function upload(file: File, begin: Record<string, unknown> = { status: 'run', run_id: 'run-1', draft_points: [], material: [], thread: [], other_names: [] }, model?: HandlerCtx['model']) {
    const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    const c: HandlerCtx = {
      service: { rpc: async (name, args) => { rpcs.push({ name, args }); return { data: name === '_canvas_draft_run_begin' ? begin : name === '_canvas_draft_add_material' ? { status: 'ok', material: [] } : true, error: null }; } },
      userId: 'owner-1', model: model ?? (async () => ({ response: null, status: 500 })), cors: {}, readLink: async () => ({ ok: false, reason: 'unreachable' }), afterResponse: () => {},
    };
    const form = new FormData();
    form.append('run_id', '00000000-0000-4000-8000-000000000001');
    form.append('file', file);
    Object.defineProperty(file, 'arrayBuffer', { value: async () => (fileBytes.get(file) ?? new Uint8Array(0)).buffer }); // jsdom's File has no arrayBuffer: give this one its bytes
    const req = { headers: new Headers({ 'content-length': '2000' }), formData: async () => form } as unknown as Request;
    const res = await handleUpload(c, req);
    return { res, rpcs, failed: rpcs.find((r) => r.name === '_canvas_draft_run_fail')?.args, json: await res.json() as Record<string, unknown> };
  }
  it('an unsupported type, an empty file, a failed reading service and a limited one are four different sentences', async () => {
    const unsupported = await upload(mk('x', 'a.exe', 'application/x-msdownload'));
    expect(unsupported.failed).toMatchObject({ p_code: 'unsupported', p_reply: WORDS.unsupported });
    const empty = await upload(mk('   ', 'a.txt', 'text/plain'));
    expect(empty.failed).toMatchObject({ p_code: 'unreadable', p_reply: WORDS.unreadable });
    const failedService = await upload(mk('%PDF', 'a.pdf', 'application/pdf'), undefined, async () => ({ response: null, status: 500 }));
    expect(failedService.failed).toMatchObject({ p_code: 'model_error', p_reply: WORDS.fileModelError });
    expect(failedService.json).toMatchObject({ code: 'READING_FAILED' });
    const limited = await upload(mk('%PDF', 'a.pdf', 'application/pdf'), undefined, async () => ({ response: null, status: 429 }));
    expect(limited.failed).toMatchObject({ p_code: 'capped', p_reply: WORDS.fileCapped });
    expect(limited.json).toMatchObject({ code: 'READING_LIMITED' }); // not CAPPED: the owner's daily limit is another thing
    expect(new Set([unsupported.failed!.p_reply, empty.failed!.p_reply, failedService.failed!.p_reply, limited.failed!.p_reply]).size).toBe(4);
  });
  it('a voice note whose transcript failed gets its words posted by the begin step', async () => {
    const t = await upload(mk('x', 'a.txt', 'text/plain'), { status: 'gone', state: 'failed', error_code: 'transcript_failed' });
    expect(t.json).toMatchObject({ code: 'GONE' });
    expect(t.rpcs.find((r) => r.name === '_canvas_draft_fail_reply')?.args).toMatchObject({ p_run: '00000000-0000-4000-8000-000000000001', p_reply: WORDS.transcriptFailed });
  });
});

describe('P1653 the instructions and the migration', () => {
  it('the instructions gain the one line, and "never guess to fill it" stays word for word', () => {
    expect(DRAFT_RULES).toContain('- When nothing fits a box, ask your question about the most likely box and name that box in it: put it first in "questions". This is about questions only.');
    expect(DRAFT_RULES).toContain('Never guess to fill it.');
  });
  const sql = read('supabase/migrations/20261110100000_p1653_never_a_wall.sql');
  const fn = (name: string) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(sql)?.[0] ?? '';
  it('the question completion writes no step, no point, no question, no link, no offer and no focus', () => {
    const q = fn('_canvas_draft_run_complete_question');
    expect(q.length).toBeGreaterThan(500);
    for (const forbidden of ['canvas_draft_steps', 'UPDATE public.points', 'INSERT INTO public.points', 'canvas_draft_offers', 'pending_links', 'questions =', 'focus =']) expect(q, forbidden).not.toContain(forbidden);
    expect(q).toContain("SET state = 'done'");
    expect(q).toContain('run_count = d.run_count + 1'); // 1 of the draft's 30
  });
  it('the expire step posts the two approved sentences, carrying the run id', () => {
    const e = fn('_canvas_draft_expire');
    expect(e).toContain("'I could not make out that voice note, so nothing changed on the canvas. Record it again or type it.'");
    expect(e).toContain("'That did not finish, so nothing changed on the canvas. Try again.'");
    expect(e).toContain('v_run.derived_refs, v_run.id');
    expect(WORDS.abandoned).toBe('That did not finish, so nothing changed on the canvas. Try again.');
    expect(WORDS.transcriptFailed).toBe('I could not make out that voice note, so nothing changed on the canvas. Record it again or type it.');
  });
  it('the three new functions are service-role only', () => {
    for (const n of ['_canvas_draft_run_complete_question', '_canvas_draft_fail_reply', '_canvas_draft_remove_material']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${n}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${n}\\([^)]*\\)\\s+TO service_role;`));
    }
    expect(sql).toMatch(/^-- diffed against: /m);
    expect(sql).toMatch(/^-- client-safe: /m);
  });
  const fix = read('supabase/migrations/20261110110000_p1653_fix_batch.sql');
  const fixFn = (name: string) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(fix)?.[0] ?? '';
  it('"Not mine" keeps the row as a tombstone (kind link_rejected, no text) in a NEW migration, so the URL stays known and the page\'s words are gone', () => {
    const r = fixFn('_canvas_draft_remove_material');
    expect(r.length).toBeGreaterThan(300);
    expect(r).toContain("SET kind = 'link_rejected', text = '', chars = 0");
    expect(r).not.toMatch(/DELETE FROM/);
    for (const g of ["m.kind = 'link'", 'm.owner_id = p_owner', 'm.draft_id = v_run.draft_id']) expect(r, g).toContain(g);
    expect(fix).toMatch(/CHECK \(kind IN \('file', 'link', 'messages', 'link_rejected'\)\)/);
    expect(sql, 'the applied migration is untouched by this fix').toContain('DELETE FROM public.canvas_draft_material m');
  });
  const tapSql = read('supabase/migrations/20261110120000_p1653_structured_tap.sql');
  const tapFn = (name: string) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(tapSql)?.[0] ?? '';
  it('the tap marker: a closed table, written only by canvas_mark_tap for the caller\'s own message with exactly the token text, in an open draft of theirs', () => {
    expect(tapSql).toContain('ALTER TABLE public.canvas_draft_taps ENABLE ROW LEVEL SECURITY;');
    expect(tapSql).toContain('REVOKE ALL ON TABLE public.canvas_draft_taps FROM PUBLIC, anon, authenticated;');
    expect(tapSql).not.toMatch(/CREATE POLICY[^;]*canvas_draft_taps/);
    const m = tapFn('canvas_mark_tap');
    for (const g of ['auth.uid()', 'm.author_id = v_uid', "m.kind = 'message'", 'm.deleted_at IS NULL', "'Yes, this is my business'", "'Not mine'", "d.state = 'open'", 'd.owner_id = v_uid', "jsonb_build_object('status', 'refused')"]) expect(m, g).toContain(g);
    expect(m).not.toMatch(/RAISE EXCEPTION/); // a refusal is typed, never an error
    expect(tapSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.canvas_mark_tap\(uuid, text\) TO authenticated;/);
    expect(tapSql).toMatch(/REVOKE ALL ON FUNCTION public\.canvas_mark_tap\(uuid, text\) FROM PUBLIC, anon;/);
    // the SQL's fixed texts are the TS tokens
    expect(m).toContain(`'${PAGE_BUTTONS.yes.token}'`);
    expect(m).toContain(`'${PAGE_BUTTONS.no.token}'`);
  });
  it('the tap state is service-role only and says: marked taps whose text still equals the token, the newest agent reply, and whether anyone wrote since', () => {
    const s = tapFn('_canvas_draft_tap_state');
    for (const g of ['v_run.owner_id IS DISTINCT FROM p_owner', "m.kind = 'agent'", 'm.created_at < v_trig.created_at', "m.kind <> 'agent'", 'm.created_at > v_at', 'm.id <> v_trig.id', "'owner_after'"]) expect(s, g).toContain(g);
    expect(tapSql).toMatch(/GRANT EXECUTE ON FUNCTION public\._canvas_draft_tap_state\(uuid, uuid\)\s+TO service_role;/);
    expect(tapSql).toMatch(/REVOKE ALL ON FUNCTION public\._canvas_draft_tap_state\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/);
  });
  it('a fork never copies a rejected page: the selector leaves link_rejected out when called for a fork (p_run IS NULL), and a run still gets it', () => {
    const e = tapFn('_canvas_draft_effective_input');
    expect(e).toContain("(p_run IS NOT NULL OR x.kind <> 'link_rejected')");
    const original = /CREATE OR REPLACE FUNCTION public\._canvas_draft_effective_input\([\s\S]*?\n\$\$;/.exec(read('supabase/migrations/20261030080000_p1536_v6_engine.sql'))?.[0] ?? '';
    // the restated body is the v6 body plus that one condition and nothing else
    expect(e.replace("       AND (p_run IS NOT NULL OR x.kind <> 'link_rejected')\n", '')).toBe(original);
    expect(read('supabase/migrations/20261030080000_p1536_v6_engine.sql')).toMatch(/_canvas_draft_effective_input\(v_src\.id, NULL\)/); // the fork's call
  });
  it('the newest-reply lookup is service-role only, owner-checked, and reads only agent replies of the run\'s own thread before its message', () => {
    const r = fixFn('_canvas_draft_newest_reply');
    for (const g of ["m.kind = 'agent'", 'm.deleted_at IS NULL', 'm.thread_root_id = v_d.thread_root_id', 'v_run.owner_id IS DISTINCT FROM p_owner', 'm.created_at < v_trig.created_at']) expect(r, g).toContain(g);
    expect(fix).toMatch(/REVOKE ALL ON FUNCTION public\._canvas_draft_newest_reply\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(fix).toMatch(/GRANT EXECUTE ON FUNCTION public\._canvas_draft_newest_reply\(uuid, uuid\)\s+TO service_role;/);
    expect(fix).toMatch(/^-- diffed against: /m);
    expect(fix).toMatch(/^-- client-safe: /m);
  });
  it('the question completion matches the existing completion on a deleted trigger message: neither re-checks it at complete (only begin does)', () => {
    const existing = /CREATE OR REPLACE FUNCTION public\._canvas_draft_run_complete\(\s*p_run uuid, p_owner uuid, p_actions jsonb[\s\S]*?\n\$\$;/.exec(read('supabase/migrations/20261103010000_p1536_server_review_fixes.sql'))?.[0] ?? '';
    expect(existing.length).toBeGreaterThan(5000);
    expect(existing).not.toContain('deleted_at');
    expect(fn('_canvas_draft_run_complete_question')).not.toContain('deleted_at');
  });
  it('the question completion writes scope as the same text[] the column and every other completion use', () => {
    expect(read('supabase/migrations/20261030080000_p1536_v6_engine.sql')).toContain('ADD COLUMN IF NOT EXISTS scope              text[]');
    expect(fn('_canvas_draft_run_complete_question')).toContain("scope = '{}'"); // an untyped literal assigned to text[]: an empty array, not an object
  });
});
