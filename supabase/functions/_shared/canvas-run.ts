/**
 * P1536: one canvas draft run, start to finish, behind injected seams (the database calls, the model, the
 * link reader). index.ts passes the real ones; src/tests/p1536-canvas-draft.test.ts passes fakes and runs the
 * whole pipeline.
 *
 * Design v6: a run is one `canvas_draft_runs` row, made by a user RPC (`canvas_workspace_send`, a retry, a focus switch,
 * a fork) and begun here by its id (`_canvas_draft_run_begin`). Its state lives in the database, never here: every path
 * below ends it with `_canvas_draft_run_complete` or `_canvas_draft_run_fail`, so a reload loses nothing.
 *
 * What a run may change (its scope) comes from the run, not from the model: a tagged message changes exactly its tags, an
 * untagged one the boxes the model names (validated), the first draft, a focus switch and a fork's first run all nine. A
 * message run never changes the focus. The database enforces the same rule again at complete.
 *
 * Material is data. This code never lets it choose where anything is written: the target canvas, draft and
 * owner come from the verified caller and the begin row, and the model returns only structured actions on
 * ids it was given (canvas-parse.ts parseDraft).
 *
 * Logging: fixed codes and counts only. Never material, a URL, a reply, a name or the key.
 */

import { assembleMaterial } from './canvas-source.ts';
import { failRun } from './canvas-fail.ts';
import { WORDS, providerFailureReply, unusableAnswerReply } from './canvas-reply-table.ts';
import { emptyAnswer, postFailReply, resolveTap, staleTap, tapRun, withoutTaps } from './canvas-nothing.ts';
import { RequestTooLarge, fitRequest } from './canvas-fit.ts';
import { DeadlineExceeded } from './canvas-deadline.ts';
import { costUsd, type GeminiRequest, type GeminiUsage, type TokenCounter } from './mirror-agent.ts';
import { buildDraftRequest, choiceAllowed } from './canvas-prompt.ts';
import { parseDraft } from './canvas-parse.ts';
import { parsedLine } from './canvas-measure.ts';
import { buildDraftReply, withCutNote } from './canvas-reply.ts';
import { choiceRun, closedRun, draftOffer, type RunTools } from './canvas-choice-run.ts';
import { draftReplyOf, offersToAdd } from './canvas-run-reply.ts';
import type { LinkResult } from './canvas-material.ts';
import { frameOf, scopeOf } from './canvas-frame.ts';
import { withCopySections } from './canvas-copy-sections.ts';
import { derivedNames, namesMatcher } from './canvas-names.ts';
import { gatherLinks, ownerItems, textOf, toCopies, triggerOf } from './canvas-thread.ts';
import type { ModelCaller } from './canvas-model.ts';
import type { BasePoint, Material, MaterialInput } from './canvas-types.ts';

/** The three kinds of run a user action creates. */
export type RunKind = 'message' | 'focus' | 'fork_first';

export interface ThreadItem {
  kind: 'owner_message' | 'clarify_copy';
  text?: string | null;
  message_id?: string | null;
  /** The boxes the owner tagged the message with (Add to chat). */
  box_refs?: string[] | null;
  /** True for the one message that started this run. */
  is_trigger?: boolean;
  label?: string | null;
  /** clarify_copy: the lines of the copy, each with whose it is. A copy without lines counts as other people's. */
  lines?: Array<{ by: 'owner' | 'other'; text: string }> | null;
}
/**
 * `messages` is a fork's seed row. "Your messages" holds the owner's own typed messages. "Earlier material" is the fork's consolidation of the OLDEST seed rows of any
 * kind (files and links among them): it is not the owner's typed words, so it is read as a file (Opus 4). The label is the database's own literal (canvas_draft_fork).
 */
export const OWN_MESSAGES_LABEL = 'Your messages';
/** `link_rejected` is the tombstone of a page the owner said is not theirs (P1653): its URL stays known so it is never read again, and it is in no input. */
export interface MaterialRow { id?: string; kind: 'file' | 'link' | 'messages' | 'link_rejected'; label: string; text: string; message_id?: string | null; origin?: string }

/** The `run` row `_canvas_draft_run_begin` returns when it starts a run (status 'run'). */
export interface CanvasRun {
  status: 'run';
  run_id: string;
  kind?: RunKind;
  reserved_usd?: number | null;
  /** The app path of the draft. */
  canvas_path?: string | null;
  /** "v1": the label of the version the draft starts from, or null on a first canvas. */
  base_label?: string | null;
  /** The whole canvas is to be drafted: a fork's first run, or an untagged message on an empty draft with no focus yet. */
  first_draft?: boolean;
  /** The business the canvas is about now; a message run never changes it. */
  focus?: string | null;
  /** A focus run's target group. */
  target_group?: string | null;
  /** The boxes the trigger message was tagged with. */
  box_refs?: string[] | null;
  /** How the run's message arrived: an upload says "Your new file" in J9, a voice note "Your voice note". */
  input_kind?: 'text' | 'file' | 'voice';
  /** The offers the draft holds, in every state: a group matching one is never offered again. */
  offers?: Array<{ id?: string; group_label: string; state: string }>;
  trigger_message_id?: string | null;
  /** What the draft holds now, with ids: the points the actions act on. */
  draft_points: BasePoint[];
  material: MaterialRow[];
  thread: ThreadItem[];
  /** Names of other people in the material; no point or story may contain one. */
  other_names: string[];
  /** The owner's full name: never learned as another person from a file or a link. */
  owner_name?: string | null;
}

export interface RpcResult { data: unknown; error: { code?: string; message?: string } | null }
export interface RunDeps {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  model: ModelCaller;
  readLink: (url: string, signal?: AbortSignal) => Promise<LinkResult>;
  /** The model's token counter (free). Absent or failing: the UTF-8 byte bound decides. */
  count?: TokenCounter;
  /** The invocation's deadline (canvas-deadline.ts), shared by every step. */
  signal?: AbortSignal;
}
export interface RunParams {
  ownerId: string;
  /** What an upload's extraction cost in this invocation (the reservation covers it; the run settles one number). */
  extraUsd?: number | null;
}
export interface RunSummary { state: 'done' | 'failed'; code?: string }

/** The cost to charge for a model call that returned nothing: refused upfront costs only what the upload already spent, else the reservation. */
function failureUsd(status: number, run: CanvasRun, extra: number): number | null {
  const refusedUpfront = status >= 400 && status < 500;
  return refusedUpfront ? extra : run.reserved_usd ?? null;
}

const failCode = (status: number) => (status === 429 || status === 403 ? 'capped' : status ? `http_${status}` : 'network');

/** Everything one run's steps share. */
export interface Step {
  deps: RunDeps; run: CanvasRun; p: RunParams; input: MaterialInput; material: Material; unreadable: string[];
  stub: Record<string, unknown>; kind: RunKind; extra: number;
  /** P1653: the links this run read itself (not the ones already in the draft's material): only a page read now is asked about. */
  fresh?: Array<{ url: string; text: string }>;
  /** What the run has spent so far, to settle if it ends here: an upload's extraction, then (once a model call is out) the reservation or the reported cost. */
  ledger: { usd: number | null };
}

const TIMEOUT_REPLY = WORDS.timeout;
const TOO_LARGE_REPLY = WORDS.tooLarge;

/** The request, with the material cut until the model's own count fits the reserved input; or the run's failure. */
export async function fitOrFail<T extends { request: GeminiRequest }>(s: Step, build: (cap: number) => T): Promise<(T & { tokens: number; counted: boolean }) | RunSummary> {
  try {
    return await fitRequest(build, s.deps.count, s.deps.signal);
  } catch (e) {
    if (e instanceof DeadlineExceeded) return await failRun(s.deps, s.run, s.p, 'timeout', TIMEOUT_REPLY, s.ledger.usd);
    if (!(e instanceof RequestTooLarge)) throw e;
    return await failRun(s.deps, s.run, s.p, 'too_large', TOO_LARGE_REPLY, s.extra); // nothing was sent: only an upload's own extraction is charged
  }
}

export { failRun };

const zeroFacts = (s: Step) => ({ total: 0, unreadable: s.unreadable, droppedUnverified: 0, droppedNames: 0 });

type Fitted = { material: Material; request: GeminiRequest };

/** The model call under the invocation's deadline, with the ledger kept true; the answer, or the run's failure. */
export async function askModel(s: Step, fit: Fitted, cut: (reply: string) => string): Promise<{ response: unknown } | RunSummary> {
  const { run, p, deps } = s;
  if (deps.signal?.aborted) return await failRun(deps, run, p, 'timeout', TIMEOUT_REPLY, s.ledger.usd);
  s.ledger.usd = run.reserved_usd ?? null; // the call is about to be out: if the run ends before its cost is known, the reservation is what it may have cost
  const { response, status } = await deps.model({ kind: 'draft', request: fit.request, stub: { ...s.stub, material: fit.material }, signal: deps.signal });
  if (response) {
    const cost = costUsd((response as { usageMetadata?: GeminiUsage }).usageMetadata);
    s.ledger.usd = cost === null ? run.reserved_usd ?? null : cost + s.extra;
    return { response };
  }
  if (deps.signal?.aborted) return await failRun(deps, run, p, 'timeout', TIMEOUT_REPLY, run.reserved_usd ?? null); // cut while in flight: it may have been billed
  const code = failCode(status);
  return await failRun(deps, run, p, code, cut(providerFailureReply(code)), failureUsd(status, run, s.extra));
}

/**
 * J9: an upload into a canvas that already has a first draft whose own points all failed, but which reports another group. The run is not a failure: it completes with
 * nothing applied (the database then records the offers and says the J9 line), because failing it would lose the offers exactly when the file was about another business (Opus 3).
 */
function keepsOffers(run: CanvasRun, kind: RunKind, out: Parsed): boolean {
  return kind === 'message' && run.input_kind === 'file' && run.first_draft !== true && out.otherCanvases.length > 0;
}

/** The failure a parsed answer amounts to (unusable, or nothing supported), or null when there is something to write. */
async function failureOf(s: Step, out: ReturnType<typeof parseDraft>, usd: number | null, cut: (reply: string) => string, response: unknown): Promise<RunSummary | null> {
  const { run, p, deps } = s;
  // P1653 TEMPORARY measurement line (counts only, never model text or owner words); remove after the replay.
  try { console.log(parsedLine(run.run_id, out, response)); } catch { /* measurement must never change a run */ }
  if (!out.ok) return await failRun(deps, run, p, out.code, cut(unusableAnswerReply(out.code)), usd);
  const drops = out.droppedUnverified + out.droppedNames;
  if (out.scope.length > 0 && out.total === 0 && (drops > 0 || s.kind !== 'message' || run.first_draft) && !keepsOffers(run, s.kind, out)) {
    return await failRun(deps, run, p, 'nothing_supported', cut(buildDraftReply({ ...zeroFacts(s), outcome: 'failed', droppedUnverified: out.droppedUnverified, droppedPoints: out.droppedPoints, droppedNames: out.droppedNames })), usd);
  }
  return null;
}

/** The helpers canvas-choice-run.ts calls (passed, so neither module imports the other at run time). */
const TOOLS: RunTools = { failRun, askModel, fitOrFail };

/** The draft: one model call, the checks, one write. */
async function runDraft(s: Step): Promise<RunSummary> {
  const { run } = s;
  const baseLabel = run.base_label ?? null;
  const basePoints = run.draft_points;
  const frame = withCopySections(frameOf(run, s.kind), s.material, namesMatcher(run.other_names, derivedNames(s.material, run.owner_name)));
  const fit = await fitOrFail(s, (cap) => {
    const material = assembleMaterial(s.input, cap);
    return { material, request: buildDraftRequest({ material, basePoints, baseLabel, frame }) };
  });
  if ('state' in fit) return fit;
  const cut = (reply: string) => withCutNote(reply, fit.material.truncated); // a failure reply says the material was cut too
  const asked = await askModel(s, fit, cut);
  if ('state' in asked) return asked;
  const out = parseDraft(asked.response, {
    material: fit.material, basePoints, baseLabel, otherNames: run.other_names, ownerName: run.owner_name,
    scope: scopeOf(frame), rebuild: frame.rebuild, currentFocus: run.focus ?? null, acceptFocus: run.first_draft === true && s.kind === 'message',
    knownGroups: (run.offers ?? []).map((o) => o.group_label), listOffers: s.kind !== 'focus', offersOnEmptyScope: s.kind === 'message' && run.input_kind === 'file', sections: frame.copySections ?? null,
    allowChoice: choiceAllowed(frame, fit.material), // the same predicate and inputs the request's schema was built from
  });
  const usd = out.costUsd !== null ? out.costUsd + s.extra : run.reserved_usd ?? null;
  // P1646: a message that contradicts current points offers options and writes nothing until the owner picks
  const offered = draftOffer(s, TOOLS, out, cut, usd);
  if (offered) return await offered;
  // P1653 F1/F5: a first draft the model wrote nothing for asks its follow-up as a finished run (emptyAnswer); every other empty answer fails as before
  const asks = out.ok ? emptyAnswer(s, TOOLS, out, asked.response, usd, cut) : null;
  if (asks) { try { console.log(parsedLine(run.run_id, out, asked.response)); } catch { /* P1653 TEMPORARY measurement (same line as failureOf): must never change a run */ } return await asks; }
  return (await failureOf(s, out, usd, cut, asked.response)) ?? (await completeDraft(s, out as Parsed, usd, fit.material.truncated));
}

type Parsed = Extract<ReturnType<typeof parseDraft>, { ok: true }>;

/** The reply and the one write of a run that has something to say. */
async function completeDraft(s: Step, out: Parsed, usd: number | null, truncated: boolean): Promise<RunSummary> {
  const { run, p, deps } = s;
  const others = offersToAdd(run, out);
  const reply = draftReplyOf(run, s.kind, out, others, { truncated, unreadable: s.unreadable });
  const { data, error } = await deps.rpc('_canvas_draft_run_complete', {
    p_run: run.run_id, p_owner: p.ownerId, p_actions: out.actions, p_questions: out.questions, p_scope: out.scope,
    p_focus: run.first_draft && s.kind === 'message' ? out.focus : null, // only the first draft takes the model's focus
    p_other_canvases: others, p_note: out.note || null, p_reply: reply, p_usd: usd,
  });
  if (error || !data) {
    console.error('canvas-draft: write failed', { code: error?.code });
    return await failRun(deps, run, p, 'write', WORDS.write, usd);
  }
  const closed = closedRun(data as { status?: string; code?: string });
  if (closed) {
    if (closed.code === 'not_offered') await postFailReply(deps.rpc, run.run_id, p.ownerId, WORDS.notOffered); // the database failed the run without a word
    return closed;
  }
  console.log('canvas-draft: done', { points: out.total, dropped: out.droppedUnverified + out.droppedNames + out.droppedScope, cost: out.costUsd });
  return { state: 'done' };
}

const isOwnMessages = (m: MaterialRow) => m.kind === 'messages' && m.label === OWN_MESSAGES_LABEL;

export async function executeRun(deps: RunDeps, p: RunParams, run: CanvasRun): Promise<RunSummary> {
  const ledger: { usd: number | null } = { usd: p.extraUsd ?? 0 };
  try {
    const { unreadable, rows, gone } = await gatherLinks(deps, p, run);
    if (gone) return { state: 'failed', code: 'gone' };
    if (deps.signal?.aborted) return await failRun(deps, run, p, 'timeout', TIMEOUT_REPLY, ledger.usd);
    // P1653: a tap on one of the two fixed buttons adds no evidence, here or in any later run: it is never in the material
    const { tap: tapped, trigger: tapMessage } = await resolveTap(deps, p, run, run.kind ?? 'message');
    if (tapped === 'stale') return await staleTap(deps, run, p, TOOLS); // no open question to answer: says so, no model call, no update used
    const thread = withoutTaps(run.thread, tapped ? null : tapMessage); // a token typed while a choice is open is the owner's own message
    const trigger = triggerOf(thread);
    const input: MaterialInput = {
      trigger: trigger ? { text: textOf(trigger), tagged: trigger.box_refs ?? null } : null,
      // a fork's "Your messages" seed row is the owner's own typed words: it comes first, then the messages of this thread
      messages: [...run.material.filter(isOwnMessages).map((m) => m.text), ...ownerItems(thread).filter((t) => t !== trigger).map(textOf)],
      copies: toCopies(thread),
      links: [...run.material.filter((m) => m.kind === 'link').map((m) => ({ url: m.label, text: m.text })), ...rows],
      files: run.material.filter((m) => m.kind === 'file' || (m.kind === 'messages' && !isOwnMessages(m))).map((m) => ({ name: m.label, text: m.text })),
    };
    const material = assembleMaterial(input);
    const kind: RunKind = run.kind ?? 'message';
    const step: Step = {
      deps, run, p, input, material, unreadable, kind, extra: p.extraUsd ?? 0, ledger, fresh: rows,
      stub: { material, basePoints: run.draft_points, otherNames: run.other_names },
    };
    const tap = tapped ? tapRun(step, TOOLS, tapped) : null; // "Not mine", or a stale tap: no model call
    if (tap) return await tap;
    if (!material.items.some((i) => i.owner)) {
      return await failRun(deps, run, p, 'no_readable_material', unreadable.length ? buildDraftReply({ ...zeroFacts(step), outcome: 'failed' }) : WORDS.nothingFromYou, step.extra);
    }
    return await (choiceRun(step, TOOLS) ?? runDraft(step)); // P1646: a short reply that picks from the latest choice, else a draft
  } catch (e) {
    console.error('canvas-draft: run crashed', { error: (e as Error).name });
    return await failRun(deps, run, p, 'internal', WORDS.internal, ledger.usd);
  }
}
