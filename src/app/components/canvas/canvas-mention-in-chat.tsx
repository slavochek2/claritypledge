/**
 * @file canvas-mention-in-chat.tsx
 * @description P1621 (replaces P1613's Add to chat, which sat in every box header): "Mention in chat" at the top right of the SELECTED box, for the owner only (the workspace
 * context carries the tap only for the owner's own canvas, so a reader, a signed-out visitor and an owner with no mirror chat see nothing). It puts a pill in the composer.
 * The button itself must show that something happened: it reads "Mentioned" while that box's pill is in the composer (or waiting for it), and a repeat click adds no
 * second pill (the composer holds each box once), while the tap still shows the thread. Quiet grey with a hover, at least 40px; the label always shows, wrapping if the box is narrow.
 */
import { Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMentionedBoxes } from '@/app/pages/chat/use-mentioned-boxes';
import { useCanvasWorkspace } from './canvas-workspace-context';
import { CANVAS_QUIET_ACTION } from './canvas-pill-styles';

// [FOUNDER DECISION: pending P1621 review] the spec names the button "Mention in chat"; "Mentioned" is the confirmation wording still to approve.
export const MENTION_IN_CHAT_LABEL = 'Mention in chat';
export const MENTIONED_LABEL = 'Mentioned';

/**
 * `tag` is the mention key: a box tag (the box-level button, at the top right of a selected box, kept for an empty box), or a point's key (`pointKey`, P1621 round 2: the button on a
 * card, beside Edit and Open, where "Mentioned" is per point). `card` drops the box button's right-aligned look.
 */
export function MentionInChatButton({ tag, title, card = false, testId }: { tag: string; title: string; card?: boolean; testId?: string }) {
  const { addToChat } = useCanvasWorkspace();
  const mentioned = useMentionedBoxes().has(tag);
  if (!addToChat) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      // A repeat click still brings the thread into view (it may be hidden); the composer takes no second pill for a box it already holds.
      onClick={() => addToChat(tag)}
      aria-pressed={mentioned}
      aria-label={`${mentioned ? MENTIONED_LABEL : MENTION_IN_CHAT_LABEL}, ${title}`}
      data-testid={testId ?? `canvas-mention-in-chat-${tag}`}
      data-mentioned={mentioned || undefined}
      className={`${CANVAS_QUIET_ACTION} ${card ? '' : 'ml-auto '}h-auto shrink-0 whitespace-normal text-left`}
    >
      {mentioned ? <Check aria-hidden="true" /> : <MessageSquare aria-hidden="true" />}
      <span>{mentioned ? MENTIONED_LABEL : MENTION_IN_CHAT_LABEL}</span>
    </Button>
  );
}
