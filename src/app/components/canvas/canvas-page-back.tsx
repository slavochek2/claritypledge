/**
 * @file canvas-page-back.tsx
 * @description The canvas page's Back (P1545): to where the reader came from, a cold arrival to the canvases list. Inside the owner's
 * workspace the bar's own ← takes its place (one Back on screen, and it follows §2 of P1536).
 */
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ARTIFACTS_CANVASES_MINE } from '@/app/pages/artifacts/legacy-redirect-targets';
import { useCanvasWorkspace } from './canvas-workspace-context';

export function CanvasPageBack() {
  // The owner's bar has its own ← (W8): one Back on screen.
  const { active, ownerBar } = useCanvasWorkspace();
  return active || ownerBar ? null : <FocusHeader fallback={ARTIFACTS_CANVASES_MINE} />;
}
