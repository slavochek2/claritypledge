/**
 * @file event-canvas-setup-service.ts
 * @description P1529 E5: the "Make your Clarity Canvas" part before round 1. One row per event holds when it ends
 * (migration 20261112193000). The host starts and ends it; the host screen, the projector and every phone read it.
 */
import { supabase } from '@/lib/supabase';

/** The end of the event's canvas setup in epoch ms, or null when the host never started one. Throws on failure: callers keep what they show. */
export async function getCanvasSetupEnd(eventId: string): Promise<number | null> {
  const { data, error } = await supabase.from('event_canvas_setups').select('ends_at').eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  const at = (data as { ends_at?: string } | null)?.ends_at;
  return at ? new Date(at).getTime() : null;
}

/** Starts (or restarts) the setup for `seconds` (1..7200). Returns the end in epoch ms. */
export async function hostStartCanvasSetup(eventId: string, seconds: number): Promise<number> {
  const { data, error } = await supabase.rpc('host_start_canvas_setup', { p_event: eventId, p_seconds: seconds });
  if (error) throw error;
  return new Date(data as string).getTime();
}

/** Ends the setup now. Idempotent. */
export async function hostEndCanvasSetup(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('host_end_canvas_setup', { p_event: eventId });
  if (error) throw error;
}
