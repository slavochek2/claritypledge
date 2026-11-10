/**
 * P1536: what a run reads from its thread: the owner's messages (the one that started the run first), copied chats, and the
 * links in the trigger message. Replies are not read here or anywhere: the draft points are the state, never the mirror's words.
 * Pure: no Deno or esm.sh imports.
 */

import { MAX_LINKS_PER_RUN, extractUrls, linkFailureText, linkKey } from './canvas-material.ts';
import type { CanvasRun, RunDeps, RunParams, ThreadItem } from './canvas-run.ts';
import type { CopyInput } from './canvas-types.ts';

export function toCopies(thread: ThreadItem[]): CopyInput[] {
  return thread.filter((t) => t.kind === 'clarify_copy').map((t) => ({
    label: (t.label ?? 'copied chat').slice(0, 80),
    lines: t.lines ?? (t.text ? [{ by: 'other' as const, text: t.text }] : []),
  }));
}

export const textOf = (t: ThreadItem) => (typeof t.text === 'string' ? t.text.trim() : '');
export const ownerItems = (thread: ThreadItem[]) => thread.filter((t) => t.kind === 'owner_message' && textOf(t));
export const triggerOf = (thread: ThreadItem[]) => ownerItems(thread).find((t) => t.is_trigger) ?? null;

/** New links from the trigger message (never from another person's lines), read and kept as material of that message. */
export async function gatherLinks(deps: RunDeps, p: RunParams, run: CanvasRun): Promise<{ unreadable: string[]; rows: Array<{ url: string; text: string }>; gone: boolean }> {
  const unreadable: string[] = [];
  const rows: Array<{ url: string; text: string }> = [];
  const trigger = triggerOf(run.thread);
  const source = trigger ? [trigger] : ownerItems(run.thread); // a run without a trigger message reads every owner message
  // a rejected page ("Not mine", P1653) is a tombstone that keeps its label: its URL is known, so no retry, fork or run without a trigger message reads it again
  // compared by ONE identity (linkKey), so another spelling of the same page ("Airbnb.com", "www.airbnb.com", a trailing slash) is the same page
  // (a link is kept under its own key; an older row kept under the raw text is found by its key too)
  const known = new Set(run.material.filter((m) => m.kind === 'link' || m.kind === 'link_rejected').flatMap((m) => [m.label, linkKey(m.label)]));
  const keys = new Set<string>();
  const fresh = source.flatMap((t) => extractUrls(textOf(t))).filter((u) => { const k = linkKey(u); if (known.has(k) || keys.has(k)) return false; keys.add(k); return true; });
  for (const url of fresh.slice(MAX_LINKS_PER_RUN)) unreadable.push(`${url.slice(0, 200)} (more than ${MAX_LINKS_PER_RUN} links in one go; send the rest again)`);
  for (const url of fresh.slice(0, MAX_LINKS_PER_RUN)) {
    const r = await deps.readLink(url, deps.signal);
    if (deps.signal?.aborted) return { unreadable, rows, gone: false }; // the run's deadline fired: the caller fails the run
    if (!r.ok) { unreadable.push(`${url.slice(0, 200)} (${linkFailureText(r.reason)})`); continue; }
    rows.push({ url: linkKey(url), text: r.text }); // kept under its key: the label of a page is its one identity
    // Kept with the trigger message so a reload or a retry loses nothing; a write for a run that is no longer running is refused ('gone').
    const { data, error } = await deps.rpc('_canvas_draft_add_material', {
      p_run: run.run_id, p_owner: p.ownerId, p_kind: 'link', p_label: linkKey(url), p_text: r.text,
    });
    if (error) console.error('canvas-draft: link not kept', { code: error.code });
    if ((data as { status?: string } | null)?.status === 'gone') return { unreadable, rows, gone: true };
  }
  return { unreadable, rows, gone: false };
}

