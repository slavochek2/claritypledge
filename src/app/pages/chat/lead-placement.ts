/**
 * @file lead-placement.ts
 * @description P1536: where a message list draws its `lead` (the mirror's greeting, a canvas thread's opener): above every
 * message ('top'), right after one named message ('after', an update thread: the base version card first, then the opener),
 * or not at all ('none': no lead, or earlier messages are still to load so the top of the thread is not on screen).
 */
export type LeadPlacement = 'none' | 'top' | 'after';

export function leadPlacement(hasLead: boolean, hasMore: boolean, afterId: string | null, messages: ReadonlyArray<{ id: string }>): LeadPlacement {
  if (!hasLead || hasMore) return 'none';
  return afterId && messages.some((m) => m.id === afterId) ? 'after' : 'top';
}
