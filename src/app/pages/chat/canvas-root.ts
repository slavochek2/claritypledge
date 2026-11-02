/**
 * @file canvas-root.ts
 * @description P1536: which message is the root of a canvas draft's thread. It is the message that carries a canvas version and starts its own thread (the server only lets the
 * owner attach one, in their own mirror). 3c X10/X11: only such a root reads its card from its thread's draft, and only it shows the thread's "N replies" link.
 */
import type { ChatMessage } from '@/app/data/chat-service';

export const isCanvasThreadRoot = (m: ChatMessage | null | undefined): m is ChatMessage => !!m && m.attachmentKind === 'canvas_version' && !m.isDeleted && !m.threadRootId;

/** The id a card passes to read its thread's draft, or undefined (an attachment in a reply, a quote or anything else). */
export const canvasRootId = (m: ChatMessage | null | undefined): string | undefined => (isCanvasThreadRoot(m) ? m.id : undefined);
