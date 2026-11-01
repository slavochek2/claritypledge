/**
 * @file canvas-workspace-back.ts
 * @description P1536 §2: where ← goes from the workspace. To `location.state.from` when the opener left one (an in-app path
 * only). Otherwise (direct entry, reload) Artifacts > Canvases (W1).
 */
import { ARTIFACTS_CANVASES_MINE } from '@/app/pages/artifacts/legacy-redirect-targets';

/** An in-app path only: never another origin, never a protocol-relative address. */
export function fromOf(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && /^\/(?!\/)/.test(from) ? from : null;
}

export function workspaceBackTarget(args: { state: unknown }): string {
  return fromOf(args.state) ?? ARTIFACTS_CANVASES_MINE;
}
