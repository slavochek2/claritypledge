/**
 * P1536: one canvas draft run, start to finish, behind injected seams (the database calls, the model, the
 * link reader). index.ts passes the real ones; src/tests/p1536-canvas-draft.test.ts passes fakes and runs the
 * whole pipeline.
 *
 * The run's state lives in the database (`canvas_draft_runs`), never here: `_canvas_draft_run_begin` made the
 * row, and every path below ends it with `_canvas_draft_run_complete` or `_canvas_draft_run_fail`. A reload therefore loses nothing.
 *
 * Material is data. This code never lets it choose where anything is written: the target canvas, draft and
 * owner come from the verified caller and the begin row, and the model returns only structured actions on
 * ids it was given (canvas-draft.ts parseDraft).
 *
 * Logging: fixed codes and counts only. Never material, a URL, a reply, a name or the key.
 */

import { assembleMaterial } from './canvas-source.ts';
import { RequestTooLarge, fitRequest } from './canvas-fit.ts';
import type { GeminiRequest, TokenCounter } from './mirror-agent.ts';
import { buildDraftRequest } from './canvas-prompt.ts';
import { parseDraft, questionsFor } from './canvas-parse.ts';
import { buildDraftReply, type ReplyFacts } from './canvas-reply.ts';
import { MAX_LINKS_PER_RUN, extractUrls, linkFailureText, type LinkResult } from './canvas-material.ts';
import type { ModelCaller } from './canvas-model.ts';
import type { BasePoint, CopyInput, DraftPoint, Material, MaterialInput } from './canvas-types.ts';

/** The one model call a press of "Draft" means. (The old 'tensions' pass is gone: every run drafts straight away.) */
export type RunKind = 'draft';

export interface ThreadItem {
  kind: 'owner_message' | 'clarify_copy';
  text?: string | null;
  label?: string | null;
  /** clarify_copy: the lines of the copy, each with whose it is. A copy without lines counts as other people's. */
  lines?: Array<{ by: 'owner' | 'other'; text: string }> | null;
}
export interface MaterialRow { id?: string; kind: 'file' | 'link'; label: string; text: string }

/** The `run` row `_canvas_draft_run_begin` returns when it starts a run (status 'run'). */
export interface CanvasRun {
  status: 'run';
  run_id: string;
  reserved_usd?: number | null;
  /** The app path of the draft. Returned by the start RPC; the reply no longer prints it (the draft card links the canvas). */
  canvas_path?: string | null;
  /** "v1": the label of the version the draft starts from, or null on a first canvas. */
  base_label?: string | null;
  base_points: BasePoint[];
  material: MaterialRow[];
  thread: ThreadItem[];
  /** Names of other people in the material; no point or story may contain one. */
  other_names: string[];
  /** What the draft holds now: context for a revision (the draft's own points; `reused` ones are also base points). */
  draft_points?: DraftPoint[] | null;
  /** The owner's full name: never learned as another person from a file or a link. */
  owner_name?: string | null;
}

export interface RpcResult { data: unknown; error: { code?: string; message?: string } | null }
export interface RunDeps {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  model: ModelCaller;
  readLink: (url: string) => Promise<LinkResult>;
  /** The model's token counter (free). Absent or failing: the UTF-8 byte bound decides. */
  count?: TokenCounter;
}
export interface RunParams { ownerId: string; draftId: string; kind: RunKind }
export interface RunSummary { state: 'done' | 'failed'; code?: string }

export function toCopies(thread: ThreadItem[]): CopyInput[] {
  return thread.filter((t) => t.kind === 'clarify_copy').map((t) => ({
    label: (t.label ?? 'copied chat').slice(0, 80),
    lines: t.lines ?? (t.text ? [{ by: 'other' as const, text: t.text }] : []),
  }));
}

const ownerMessages = (thread: ThreadItem[]): string[] =>
  thread.filter((t) => t.kind === 'owner_message' && typeof t.text === 'string' && t.text.trim()).map((t) => t.text as string);

/** The cost to charge for a model call that returned nothing: refused upfront costs nothing, else the reservation. */
function failureUsd(status: number, run: CanvasRun): number | null {
  const refusedUpfront = status >= 400 && status < 500;
  return refusedUpfront ? 0 : run.reserved_usd ?? null;
}

const failCode = (status: number) => (status === 429 || status === 403 ? 'capped' : status ? `http_${status}` : 'network');

/** Everything one run's steps share. */
interface Step { deps: RunDeps; run: CanvasRun; input: MaterialInput; material: Material; unreadable: string[]; stub: Record<string, unknown> }

const TOO_LARGE_REPLY = 'That is more than I can read in one go. Nothing was changed. Try a shorter file, or fewer files.';

/** The request, with the material cut until the model's own count fits the reserved input; or the run's failure. */
async function fitOrFail<T extends { request: GeminiRequest }>(s: Step, build: (cap: number) => T): Promise<(T & { tokens: number; counted: boolean }) | RunSummary> {
  try {
    return await fitRequest(build, s.deps.count);
  } catch (e) {
    if (!(e instanceof RequestTooLarge)) throw e;
    return await failRun(s.deps, s.run, 'too_large', TOO_LARGE_REPLY, 0); // nothing was sent: nothing is charged
  }
}

async function failRun(deps: RunDeps, run: CanvasRun, code: string, reply: string | null, usd: number | null): Promise<RunSummary> {
  try {
    const { error } = await deps.rpc('_canvas_draft_run_fail', { p_run: run.run_id, p_code: code, p_reply: reply, p_actual_usd: usd });
    if (error) console.error('canvas-draft: fail write failed', { code: error.code });
  } catch (e) {
    console.error('canvas-draft: fail write threw', { error: (e as Error).name });
  }
  return { state: 'failed', code };
}

/** New links from the owner's own messages (never from another person's lines), read and kept as material. */
async function gatherLinks(deps: RunDeps, p: RunParams, run: CanvasRun): Promise<{ unreadable: string[]; rows: Array<{ url: string; text: string }> }> {
  const unreadable: string[] = [];
  const rows: Array<{ url: string; text: string }> = [];
  const known = new Set(run.material.filter((m) => m.kind === 'link').map((m) => m.label));
  const fresh = ownerMessages(run.thread).flatMap(extractUrls).filter((u, i, all) => !known.has(u) && all.indexOf(u) === i);
  for (const url of fresh.slice(MAX_LINKS_PER_RUN)) unreadable.push(`${url.slice(0, 200)} (more than ${MAX_LINKS_PER_RUN} links in one go; send the rest again)`);
  for (const url of fresh.slice(0, MAX_LINKS_PER_RUN)) {
    const r = await deps.readLink(url);
    if (!r.ok) { unreadable.push(`${url.slice(0, 200)} (${linkFailureText(r.reason)})`); continue; }
    rows.push({ url: url.slice(0, 200), text: r.text });
    // Kept with the draft so a reload or a later run loses nothing; this run uses the text either way.
    const { error } = await deps.rpc('_canvas_draft_add_material', {
      p_owner: p.ownerId, p_draft: p.draftId, p_kind: 'link', p_label: url.slice(0, 200), p_text: r.text,
    });
    if (error) console.error('canvas-draft: link not kept', { code: error.code });
  }
  return { unreadable, rows };
}

function emptyFacts(s: Pick<Step, 'run' | 'unreadable'>): ReplyFacts {
  return {
    baseLabel: s.run.base_label ?? null, counts: { kept: 0, reworded: 0, moved: 0, added: 0, dropped: 0 },
    total: 0, emptyBoxes: [], unreadable: s.unreadable, droppedUnverified: 0, droppedNames: 0, decided: [],
  };
}

/** The draft: one model call, the checks, one write. */
async function runDraft(s: Step): Promise<RunSummary> {
  const { run } = s;
  const baseLabel = run.base_label ?? null;
  const draftPoints = run.draft_points ?? [];
  const fit = await fitOrFail(s, (cap) => {
    const material = assembleMaterial(s.input, cap);
    return { material, request: buildDraftRequest({ material, basePoints: run.base_points, baseLabel, draftPoints }) };
  });
  if ('state' in fit) return fit;
  const { response, status } = await s.deps.model({ kind: 'draft', request: fit.request, stub: { ...s.stub, material: fit.material } });
  if (!response) {
    return await failRun(s.deps, run, failCode(status), 'I could not draft your canvas just now. Nothing was changed. Please try again in a few minutes.', failureUsd(status, run));
  }
  const out = parseDraft(response, {
    material: fit.material, basePoints: run.base_points, baseLabel, otherNames: run.other_names, draftPoints, ownerName: run.owner_name,
  });
  const usd = out.costUsd ?? run.reserved_usd ?? null;
  if (!out.ok) return await failRun(s.deps, run, out.code, 'I could not draft your canvas from that. Nothing was changed. Try again, or add more about what you sell and to whom.', usd);
  if (out.total === 0) {
    return await failRun(s.deps, run, 'nothing_supported', buildDraftReply({ ...emptyFacts(s), droppedUnverified: out.droppedUnverified, droppedNames: out.droppedNames }), usd);
  }
  const reply = buildDraftReply({
    baseLabel, counts: out.counts, total: out.total, emptyBoxes: out.emptyBoxes,
    unreadable: s.unreadable, droppedUnverified: out.droppedUnverified, droppedNames: out.droppedNames, decided: out.decided,
  });
  const { data, error } = await s.deps.rpc('_canvas_draft_run_complete', {
    p_run: run.run_id, p_actions: out.actions, p_questions: questionsFor(out.emptyBoxes), p_decided: out.decided, p_reply: reply, p_usd: usd,
  });
  if (error || !data) {
    console.error('canvas-draft: write failed', { code: error?.code });
    return await failRun(s.deps, run, 'write', 'I drafted your canvas but could not save it. Please try again.', usd);
  }
  console.log('canvas-draft: done', { points: out.total, dropped: out.droppedUnverified + out.droppedNames, cost: out.costUsd });
  return { state: 'done' };
}

export async function executeRun(deps: RunDeps, p: RunParams, run: CanvasRun): Promise<RunSummary> {
  try {
    const { unreadable, rows } = await gatherLinks(deps, p, run);
    const input: MaterialInput = {
      messages: ownerMessages(run.thread),
      copies: toCopies(run.thread),
      links: [...run.material.filter((m) => m.kind === 'link').map((m) => ({ url: m.label, text: m.text })), ...rows],
      files: run.material.filter((m) => m.kind === 'file').map((m) => ({ name: m.label, text: m.text })),
    };
    const material = assembleMaterial(input);
    const step: Step = {
      deps, run, input, material, unreadable,
      stub: { material, basePoints: run.base_points, otherNames: run.other_names },
    };
    if (!material.items.some((i) => i.owner)) return await failRun(deps, run, 'no_readable_material', buildDraftReply(emptyFacts(step)), 0);
    return await runDraft(step);
  } catch (e) {
    console.error('canvas-draft: run crashed', { error: (e as Error).name });
    return await failRun(deps, run, 'internal', 'Something went wrong and nothing was changed. Please try again.', run.reserved_usd ?? null);
  }
}
