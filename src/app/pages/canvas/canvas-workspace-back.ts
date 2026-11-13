/**
 * @file canvas-workspace-back.ts
 * @description P1536 §2: where ← goes from the workspace. To `location.state.from` when the opener left one (an in-app path
 * only). Otherwise (direct entry, reload) Artifacts > Canvases (W1).
 */
import { ARTIFACTS_CANVASES_MINE } from '@/app/pages/artifacts/legacy-redirect-targets';

/** An in-app path only: never another origin, never a protocol-relative address, and never a backslash or whitespace after the slash (browsers read `/\host` as `//host`). */
export function fromOf(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && /^\/(?![\\/\s])/.test(from) ? from : null;
}

/**
 * Whose ← the owner's bar draws (F6: exactly one back on screen). `banner`: the preparation banner above (the event's before-event preparation, `afterPublish`) carries the only back (the bar draws none); a canvas opened from the table has no banner (P1529 G6) and its header carries the back;
 * `returnBar`: the host moved the rounds and the return bar is on screen, its link is the one way back; `table`: a canvas opened from the table goes back to it; `history`: anything else goes where the opener left (workspaceBackTarget).
 */
export function ownerBarBack(args: { banner: boolean; returnBar?: boolean; table: { to: string } | null | undefined }): { kind: 'banner' } | { kind: 'returnBar' } | { kind: 'table'; to: string } | { kind: 'history' } {
  if (args.banner) return { kind: 'banner' };
  if (args.returnBar) return { kind: 'returnBar' }; // the return bar's "Back to your table" link is the way back
  return args.table ? { kind: 'table', to: args.table.to } : { kind: 'history' };
}

export function workspaceBackTarget(args: { state: unknown }): string {
  return fromOf(args.state) ?? ARTIFACTS_CANVASES_MINE;
}
