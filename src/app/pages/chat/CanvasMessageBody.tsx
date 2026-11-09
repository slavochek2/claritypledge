/**
 * @file CanvasMessageBody.tsx
 * @description P1536 S4.3 / J2: a canvas thread message's words, with its box tags drawn as chips.
 *  - the owner's tagged message (`boxRefs`): each "[Title]" the Send wrote for a tagged box is a chip in the sentence (not a control);
 *  - the mirror agent's "Updated: Offers & Pricing, My next milestone." reply (a message of kind `agent`, never a person's words): the boxes are chips that SHOW
 *    that box (the workspace's `showBox`: below 1280 it switches to Canvas, the box scrolls to the middle and rings for two seconds), 40px tall to tap. Only inside
 *    the owner's workspace.
 * Everything else is the body as it was.
 */
import type { ReactNode } from 'react';
import { ChatWords } from './ChatLinks';
import { CANVAS_CHIP } from '@/app/components/canvas/canvas-pill-styles';
import { useCanvasWorkspace } from '@/app/components/canvas/canvas-workspace-context';
import { Button } from '@/components/ui/button';
import { CANVAS_BOXES } from '@/lib/canvas-boxes';
import { cn } from '@/lib/utils';

const TAG_BY_TITLE = new Map<string, string>(CANVAS_BOXES.map(b => [b.title, b.tag]));
const UPDATED = /^Updated: ([^\n]+?)\.(\n[\s\S]*)?$/;

/**
 * The words with each "[Title]" of a tagged box drawn as a chip. Chips are never links and a link never sits inside a chip. The split keeps a
 * markdown link token (`[label](address)`) whole, so it stays plain whichever way the words are cut; the rest is linked as in any message.
 */
function withChips(body: string, refs: readonly string[], spoken: boolean): ReactNode {
  return body.split(/(\[[^\]]+\](?:\([^)]*\))?)/).map((part, i) => {
    const tag = part.endsWith(']') ? TAG_BY_TITLE.get(part.slice(1, -1)) : undefined;
    if (tag && refs.includes(tag)) return <span key={i} className={`${CANVAS_CHIP} mx-0.5 inline-block`} data-testid="message-box-chip">{part.slice(1, -1)}</span>;
    return <ChatWords key={i} text={part} spoken={spoken} />;
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
        <Button key={title} type="button" variant="ghost" onClick={() => showBox(TAG_BY_TITLE.get(title) ?? title)} className={cn(CANVAS_CHIP, 'mx-0.5 h-auto min-h-10 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500')} data-testid="reply-box-chip" data-box={TAG_BY_TITLE.get(title)}>
          {title}
        </Button>
      ))}
      {m[2] && <ChatWords text={m[2]} />}
    </>
  );
}

export function CanvasMessageBody({ body, boxRefs, agent, spoken = false }: { body: string; boxRefs?: string[] | null; /** The message is the mirror agent's (kind `agent`). */ agent: boolean; /** A transcription: spoken words. */ spoken?: boolean }) {
  const { showBox } = useCanvasWorkspace();
  if (boxRefs?.length) return <>{withChips(body, boxRefs, spoken)}</>;
  const chips = showBox && agent ? replyChips(body, showBox) : null;
  return <>{chips ?? <ChatWords text={body} spoken={spoken} />}</>;
}
