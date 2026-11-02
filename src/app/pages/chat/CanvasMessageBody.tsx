/**
 * @file CanvasMessageBody.tsx
 * @description P1536 S4.3 / J2: a canvas thread message's words, with its box tags drawn as chips.
 *  - the owner's tagged message (`boxRefs`): each "[Title]" the Send wrote for a tagged box is a chip in the sentence (not a control);
 *  - the mirror agent's "Updated: Offers & Pricing, My next milestone." reply: the boxes are chips that SHOW that box (the workspace's `showBox`: below
 *    1280 it switches to Canvas, the box scrolls to the middle and rings for two seconds), 40px tall to tap. Only inside the owner's workspace, and never for
 *    the viewer's own words (a message the owner typed to look like a reply is not one).
 * Everything else is the body as it was.
 */
import { Fragment, type ReactNode } from 'react';
import { useCanvasWorkspace } from '@/app/components/canvas/canvas-workspace-context';
import { CANVAS_BOXES } from '@/lib/canvas-boxes';
import { useChat } from './chat-state';

const TAG_BY_TITLE = new Map<string, string>(CANVAS_BOXES.map(b => [b.title, b.tag]));
const CHIP = 'rounded-full border border-blue-300 bg-background px-2 py-0.5 text-xs font-medium text-blue-700';
const UPDATED = /^Updated: ([^\n]+?)\.(\n[\s\S]*)?$/;

/** The words with each "[Title]" of a tagged box drawn as a chip. */
function withChips(body: string, refs: readonly string[]): ReactNode {
  return body.split(/(\[[^\]]+\])/).map((part, i) => {
    const tag = TAG_BY_TITLE.get(part.slice(1, -1));
    return tag && refs.includes(tag) ? <span key={i} className={`${CHIP} mx-0.5 inline-block`} data-testid="message-box-chip">{part.slice(1, -1)}</span> : <Fragment key={i}>{part}</Fragment>;
  });
}

/** "Updated: A, B." as "Updated:" and one tappable chip per box, or null when it is not that sentence (any title unknown). */
function replyChips(body: string, showBox: (tag: string) => void): ReactNode {
  const m = UPDATED.exec(body);
  const titles = m?.[1] ? m[1].split(', ') : [];
  if (!m || titles.length === 0 || titles.some(t => !TAG_BY_TITLE.has(t))) return null;
  return (
    <>
      Updated:{' '}
      {titles.map(title => (
        <button key={title} type="button" onClick={() => showBox(TAG_BY_TITLE.get(title) ?? title)} className={`${CHIP} mx-0.5 inline-flex min-h-10 items-center hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`} data-testid="reply-box-chip" data-box={TAG_BY_TITLE.get(title)}>
          {title}
        </button>
      ))}
      {m[2]}
    </>
  );
}

export function CanvasMessageBody({ body, boxRefs, authorId }: { body: string; boxRefs?: string[] | null; authorId: string | null }) {
  const { showBox } = useCanvasWorkspace();
  const { userId } = useChat();
  if (boxRefs?.length) return <>{withChips(body, boxRefs)}</>;
  const chips = showBox && authorId !== userId ? replyChips(body, showBox) : null;
  return <>{chips ?? body}</>;
}
