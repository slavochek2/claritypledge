/**
 * P1653 F3: marks the message just sent as a tap of a link-confirm button. The server accepts the mark only when the body is exactly that button's
 * token and the message is the caller's own, in an open draft's thread. It runs after the send and before the run starts: the engine reads the mark.
 * Throws CanvasTapRefused on a refusal or a failed call, so nothing starts.
 */
import { supabase } from '@/lib/supabase';

/** The server refused the mark (the question is no longer open, or the message is not that button's token): the caller says so and reloads. */
export class CanvasTapRefused extends Error {
  constructor() {
    super('canvas_mark_tap refused');
    this.name = 'CanvasTapRefused';
  }
}

export async function markCanvasTap(messageId: string, token: 'yes' | 'no'): Promise<void> {
  const { data, error } = await supabase.rpc('canvas_mark_tap', { p_message: messageId, p_token: token });
  if (error) throw new CanvasTapRefused(); // a failed mark is treated like a refusal: nothing may start
  if ((data as { status?: string } | null)?.status !== 'ok') throw new CanvasTapRefused();
}
