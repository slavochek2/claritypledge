/**
 * @file canvas-add-to-chat.tsx
 * @description P1536 D5: "Add to chat" in a box's header, for the owner only (the workspace context carries the tap only for the owner's own canvas, so a
 * reader, a signed-out visitor and an owner with no mirror chat see nothing). It sits beside the box's title, never inside the card (the card is itself a
 * button), is the design system's ghost Button with blue text, and is 44px tall.
 */
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasWorkspace } from './canvas-workspace-context';

// [FOUNDER DECISION: the label is the spec's "Add to chat" (D5).]
export const ADD_TO_CHAT_LABEL = 'Add to chat';

export function AddToChatButton({ tag, title }: { tag: string; title: string }) {
  const { addToChat } = useCanvasWorkspace();
  if (!addToChat) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => addToChat(tag)}
      aria-label={`${ADD_TO_CHAT_LABEL}, ${title}`}
      data-testid={`canvas-add-to-chat-${tag}`}
      className="-my-2 ml-auto h-auto min-h-11 shrink-0 gap-1 px-1.5 text-blue-600 hover:bg-transparent hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <MessageSquare aria-hidden="true" />
      <span>{ADD_TO_CHAT_LABEL}</span>
    </Button>
  );
}
