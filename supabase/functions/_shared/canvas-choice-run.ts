/**
 * P1646: the runs a choice takes, behind the same seams as canvas-run.ts (the database calls and the model are injected).
 *
 *   offer   a message contradicts current points: the run stores the vetted choice and writes NOTHING to the canvas;
 *   pick    a short reply ("A", "keep", "the recommended one"), tagged or not: the latest choice of the draft is read and
 *           the server applies the STORED option (never actions from here). The stored option is vetted again first, with every
 *           check a written point passes (so a number the owner never said stays refused); no model call;
 *   reoffer the choice is stale (the canvas changed) or already settled: one model call checks the earlier request against the
 *           canvas as it is now, and offers again or says it no longer conflicts.
 *
 * Every path ends the run with `_canvas_draft_run_complete_choice` (modes offer, apply, hold) or `_canvas_draft_run_fail`.
 * A run with no model call settles what the upload already spent (`s.extra`), never null (null charges the whole reservation).
 * Logging: fixed codes and counts only. Pure: no Deno or esm.sh imports.
 */

import { estimateTokens } from './mirror-agent.ts';
import { assembleMaterial, cutChars } from './canvas-source.ts';
import { buildDraftRequest, choiceAllowed } from './canvas-prompt.ts';
import { parseDraft } from './canvas-parse.ts';
import { withCutNote } from './canvas-reply.ts';
import { frameOf, scopeOf } from './canvas-frame.ts';
import { BOX_TAGS } from './canvas-draft.ts';
import {
  APPLY_STALE_REPLY, CHOICE_WRITE_REPLY, CLOSED_LEAD, KEPT_REPLY, MAX_REQUEST_CHARS, NO_CHOICE_REPLY, SETTLED_KEEP_REPLY, STALE_LEAD,
  appliedReply, choiceReply, keepLetterOf, letterOf, readPick, refusedPickReply, reofferNoneReply,
  type Choice, type ChoiceOption, type ChoicePick, type StoredChoice,
} from './canvas-choice.ts';
import type { askModel, failRun, fitOrFail, RunSummary, Step } from './canvas-run.ts';
import type { BasePoint, DraftOutcome, Material, RunFrame } from './canvas-types.ts';

/** The helpers of canvas-run.ts this module calls, passed in so the two modules do not import each other at run time. */
export interface RunTools { failRun: typeof failRun; askModel: typeof askModel; fitOrFail: typeof fitOrFail }

type ChoicePayload =
  | { mode: 'offer'; request: string } & Choice
  | { mode: 'apply'; choice_id: string; letter: string }
  | { mode: 'hold' };

const baseOf = (s: Step): Map<string, BasePoint> => new Map(s.run.draft_points.map((p) => [p.id, p]));

/** One write of a choice run. 'stale' (apply only) fails the run with a reply that asks for the pick again. */
async function complete(s: Step, t: RunTools, choice: ChoicePayload, reply: string, usd: number | null): Promise<RunSummary> {
  const { run, p, deps } = s;
  const { data, error } = await deps.rpc('_canvas_draft_run_complete_choice', {
    p_run: run.run_id, p_owner: p.ownerId, p_questions: {}, p_note: null, p_reply: reply, p_usd: usd, p_choice: choice,
  });
  if (error || !data) {
    console.error('canvas-draft: choice write failed', { code: error?.code, mode: choice.mode });
    return await t.failRun(deps, run, p, 'write', CHOICE_WRITE_REPLY, usd);
  }
  const answered = data as { status?: string; code?: string };
  if (answered.status === 'gone') return { state: 'failed', code: 'gone' };
  if (answered.status === 'failed') return { state: 'failed', code: answered.code ?? 'failed' };
  if (answered.status === 'stale') return await t.failRun(deps, run, p, 'choice_stale', APPLY_STALE_REPLY, usd);
  console.log('canvas-draft: choice done', { mode: choice.mode });
  return { state: 'done' };
}

/** The run offers the choice: stored by the server, nothing written to the canvas. */
export async function offerChoice(s: Step, t: RunTools, c: Choice, request: string, reply: string, usd: number | null): Promise<RunSummary> {
  const payload = { mode: 'offer' as const, request: cutChars(request.trim(), MAX_REQUEST_CHARS), conflicts_with: c.conflicts_with, options: c.options, recommended: c.recommended, reason: c.reason };
  console.log('canvas-draft: choice offered', { conflicts: c.conflicts_with.length, options: c.options.length });
  return await complete(s, t, payload, reply, usd);
}

const hold = (s: Step, t: RunTools, reply: string, usd: number | null) => complete(s, t, { mode: 'hold' }, reply, usd);
const apply = (s: Step, t: RunTools, id: string, letter: string, reply: string) => complete(s, t, { mode: 'apply', choice_id: id, letter }, reply, s.extra);

/** The owner's earlier request as owner material, right after this run's message (it is their own message, as the database stored it). */
function withEarlier(m: Material, request: string): Material {
  const text = request.trim();
  if (!text) return m;
  const item = { kind: 'note' as const, source: 'owner message (earlier request)', text, owner: true, earlier: true };
  const at = m.items[0]?.trigger ? 1 : 0;
  return { ...m, items: [...m.items.slice(0, at), item, ...m.items.slice(at)], tokens: m.tokens + estimateTokens(text) + estimateTokens(item.source) + 12 };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** A stored choice as the database returned it, or null when it has no usable shape. */
function storedOf(raw: unknown): StoredChoice | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const options: ChoiceOption[] = (Array.isArray(r.options) ? r.options : []).map((o) => (o ?? {}) as Record<string, unknown>)
    .filter((o) => (o.letter === 'A' || o.letter === 'B') && (o.kind === 'replace' || o.kind === 'add') && BOX_TAGS.has(str(o.box)) && str(o.statement) && str(o.quote))
    .map((o) => ({
      letter: o.letter as 'A' | 'B', kind: o.kind as 'replace' | 'add', box: str(o.box), statement: str(o.statement), quote: str(o.quote),
      means: str(o.means), also_revisit: strs(o.also_revisit), replaces: strs(o.replaces),
    }));
  const state = r.state === 'open' || r.state === 'picked' || r.state === 'kept' || r.state === 'superseded' ? r.state : null;
  const recommended = r.recommended === 'A' || r.recommended === 'B' || r.recommended === 'keep' ? r.recommended : 'A';
  if (!str(r.id) || !state || !options.length) return null;
  return { id: str(r.id), state, request: str(r.request), conflicts_with: strs(r.conflicts_with), options, recommended, reason: str(r.reason) };
}

/**
 * The stored option, vetted again as the model's own answer would be: drop what it replaces, write its statement from its quote, in
 * its box only. It passes only when every check lets exactly that statement through and nothing is refused.
 */
function stillVetted(s: Step, o: ChoiceOption, request: string): boolean {
  const { run } = s;
  const actions = [...o.replaces.map((id) => ({ action: 'drop', point_id: id, quote: '' })), { action: 'new', box: o.box, quote: o.quote, statement: o.statement }];
  const response = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ scope: [o.box], actions }) }] } }] };
  const out = parseDraft(response, {
    material: withEarlier(s.material, request), basePoints: run.draft_points, baseLabel: run.base_label ?? null, otherNames: run.other_names,
    ownerName: run.owner_name, scope: { mode: 'fixed', boxes: [o.box] }, currentFocus: run.focus ?? null, acceptFocus: false, listOffers: false,
  });
  if (!out.ok) return false;
  const refused = out.droppedUnverified + out.droppedNames + out.droppedCap + out.droppedScope;
  return refused === 0 && out.counts.dropped === o.replaces.length
    && out.actions.some((a) => a.action === 'new' && a.box === o.box && a.statement === o.statement);
}

/** The earlier request checked again against the canvas as it is now: one model call, choice only (its actions are never sent). */
async function reoffer(s: Step, t: RunTools, c: StoredChoice, lead: string): Promise<RunSummary> {
  const { run, p, deps } = s;
  const basePoints = run.draft_points;
  const baseLabel = run.base_label ?? null;
  const frame: RunFrame = { ...frameOf(run, s.kind), reoffer: true };
  const fit = await t.fitOrFail(s, (cap) => {
    const material = withEarlier(assembleMaterial(s.input, cap), c.request);
    return { material, request: buildDraftRequest({ material, basePoints, baseLabel, frame }) };
  });
  if ('state' in fit) return fit;
  const cut = (reply: string) => withCutNote(reply, fit.material.truncated);
  const asked = await t.askModel(s, fit, cut);
  if ('state' in asked) return asked;
  const out = parseDraft(asked.response, {
    material: fit.material, basePoints, baseLabel, otherNames: run.other_names, ownerName: run.owner_name, scope: scopeOf(frame),
    currentFocus: run.focus ?? null, acceptFocus: false, listOffers: false, allowChoice: choiceAllowed(frame, fit.material),
  });
  const usd = out.costUsd !== null ? out.costUsd + s.extra : run.reserved_usd ?? null;
  // [FOUNDER DECISION: wording] the model's answer could not be read
  if (!out.ok) return await t.failRun(deps, run, p, out.code, cut('I could not check that just now. Nothing was changed. Please try again.'), usd);
  if (out.choice) return await offerChoice(s, t, out.choice, c.request, cut(`${lead}\n${choiceReply(out.choice, baseOf(s))}`), usd);
  return await hold(s, t, cut(reofferNoneReply(lead)), usd);
}

/** The offer of a draft run whose answer is a choice (its actions are never sent), or null: the run goes on as before. */
export function draftOffer(s: Step, t: RunTools, out: DraftOutcome, cut: (reply: string) => string, usd: number | null): Promise<RunSummary> | null {
  if (!out.ok || !out.choice) return null;
  return offerChoice(s, t, out.choice, s.input.trigger?.text ?? '', cut(choiceReply(out.choice, baseOf(s))), usd);
}

/** A short reply (tagged or not) on a message run that already has a draft picks from the latest choice; anything else is null, a message. */
export function choiceRun(s: Step, t: RunTools): Promise<RunSummary> | null {
  if (s.kind !== 'message' || s.run.first_draft === true || !s.input.trigger) return null;
  const pick = readPick(s.input.trigger.text);
  return pick ? runPick(s, t, pick) : null;
}

/** A short reply that picks: the latest choice of this draft decides what it means. */
export async function runPick(s: Step, t: RunTools, pick: ChoicePick): Promise<RunSummary> {
  const { run, p, deps } = s;
  const { data, error } = await deps.rpc('_canvas_draft_choice_latest', { p_run: run.run_id, p_owner: p.ownerId });
  if (error || !data) {
    console.error('canvas-draft: choice read failed', { code: error?.code });
    return await t.failRun(deps, run, p, 'choice_read', CHOICE_WRITE_REPLY, s.extra);
  }
  const latest = data as { status?: string; stale?: boolean; choice?: unknown };
  if (latest.status === 'gone') return { state: 'failed', code: 'gone' };
  const c = latest.status === 'ok' ? storedOf(latest.choice) : null;
  if (!c) return await hold(s, t, NO_CHOICE_REPLY, s.extra);
  // an answered choice is never offered back for "leave it" or "the recommended one": only a letter asks about the earlier request again
  if (c.state !== 'open' && pick.kind !== 'letter') return await hold(s, t, SETTLED_KEEP_REPLY, s.extra);
  if (latest.stale === true || c.state !== 'open') return await reoffer(s, t, c, c.state === 'open' ? STALE_LEAD : CLOSED_LEAD);
  const letter = letterOf(pick, c);
  if (letter === keepLetterOf(c)) return await apply(s, t, c.id, letter, KEPT_REPLY);
  const o = c.options.find((x) => x.letter === letter);
  const base = baseOf(s);
  if (!o) return await hold(s, t, choiceReply(c, base), s.extra); // a letter the choice does not have: the choice again
  // a tagged pick may change only its tags: an option in another box is not applied, and the choice is posted again
  const tags = s.input.trigger?.tagged ?? []; // the trigger row's own box_refs: what the SQL wrapper reads, and run.box_refs is the same column
  if (tags.length && !tags.includes(o.box)) return await hold(s, t, choiceReply(c, base), s.extra);
  if (!stillVetted(s, o, c.request)) {
    console.log('canvas-draft: pick refused', { letter });
    return await hold(s, t, refusedPickReply(letter), s.extra);
  }
  return await apply(s, t, c.id, letter, appliedReply(o, base));
}
