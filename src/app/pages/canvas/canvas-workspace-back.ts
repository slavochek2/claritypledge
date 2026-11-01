/**
 * @file canvas-workspace-back.ts
 * @description P1536 §2: where ← goes from the workspace. To `location.state.from` when the opener left one (an in-app path
 * only). Otherwise: a published canvas goes to its canvas page, a draft-only canvas to Artifacts. The same on direct entry and reload.
 */
import { ARTIFACTS_CANVASES_MINE } from '@/app/pages/artifacts/legacy-redirect-targets';
import { canvasPath } from '@/lib/canvas-boxes';

/** An in-app path only: never another origin, never a protocol-relative address. */
export function fromOf(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && /^\/(?!\/)/.test(from) ? from : null;
}

export function workspaceBackTarget(args: { state: unknown; handle: string | undefined; projectTag: string | null; published: boolean }): string {
  const from = fromOf(args.state);
  if (from) return from;
  return args.published && args.handle && args.projectTag ? canvasPath(args.handle, args.projectTag) : ARTIFACTS_CANVASES_MINE;
}
