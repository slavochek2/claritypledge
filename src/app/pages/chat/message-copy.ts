/**
 * @file message-copy.ts
 * @description P1652: "Copy text". The words of a live message: its own words if it has any, otherwise a forward's copied words, otherwise a
 * voice note's transcript once ready. null (no menu item) for anything else. The words are copied exactly as stored.
 */
import { toast } from 'sonner';
import type { ChatMessage } from '@/app/data/chat-mappers';
import { transcriptView } from './voice-view';

const hasWords = (s: string | null | undefined): s is string => !!s && s.trim() !== '';

export function copyableText(m: Pick<ChatMessage, 'isDeleted' | 'body' | 'forwardSnapshot' | 'audio' | 'createdAt'>): string | null {
  if (m.isDeleted) return null;
  if (hasWords(m.body)) return m.body;
  if (hasWords(m.forwardSnapshot?.body)) return m.forwardSnapshot.body;
  if (m.audio) {
    const view = transcriptView(m.audio, m.createdAt);
    if (view.kind === 'text' && hasWords(view.text)) return view.text;
  }
  return null;
}

/** Puts the words on the clipboard and says so; says so too when the browser refuses. */
export async function copyMessageText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
    return true;
  } catch {
    toast.error("Couldn't copy. Your browser refused.");
    return false;
  }
}
