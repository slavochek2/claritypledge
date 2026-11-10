/**
 * P1653 F3: the refusal of a link-confirm button tap. A tap is sent and marked in ONE database call (`canvas_workspace_send_tap`, see
 * `sendCanvasWorkspaceMessage`), so no token message ever exists without its marker. When the question is no longer open the server sends nothing and
 * answers `stale_button`; the caller says so and reloads.
 */

import { clearListReturnCache } from '@/lib/list-return-cache';
import { supabase } from '@/lib/supabase';

/** The one call that sends a tap AND marks it (same transaction). The server fixes the message's text from the token; the caller passes no body. */
export async function callSendTap(a: { canvasId: string | null; expectedDraftId?: string | null; expectedRevision?: number | null; tap: 'yes' | 'no'; clientId: string }) {
  try {
    return await supabase.rpc('canvas_workspace_send_tap', {
      p_canvas: a.canvasId, p_expected_draft: a.expectedDraftId ?? null, p_expected_revision: a.expectedRevision ?? null, p_token: a.tap, p_client_id: a.clientId,
    });
  } finally {
    clearListReturnCache(); // it writes a chat message, so the cached lists clear here too (the caller also clears)
  }
}

/** The server refused the tap (the question is no longer open): nothing was sent and nothing runs. */
export class CanvasTapRefused extends Error {
  constructor() {
    super('canvas_workspace_send_tap refused');
    this.name = 'CanvasTapRefused';
  }
}
