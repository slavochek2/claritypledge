/**
 * @file canvas-thread-flags.ts
 * @description P1536: what a thread panel can tell about its thread before its draft has been read. A thread is a canvas draft's thread when the canvas
 * workspace mounted it as one (from the first render) or when its root message carries a canvas version. A mirror thread whose first read is still
 * out has an unknown root: it could be either, so a Send into it waits (the text is kept) rather than posting as a plain message.
 */
import type { ChatMessage } from '@/app/data/chat-service';

export function canvasThreadFlags(args: { kind: string; root: ChatMessage | undefined; status: string; fromWorkspace: boolean }): { canvasRoot: boolean; rootPending: boolean } {
  const mirror = args.kind === 'mirror';
  return {
    canvasRoot: mirror && (args.fromWorkspace || args.root?.attachmentKind === 'canvas_version'),
    rootPending: mirror && !args.root && args.status === 'loading',
  };
}
