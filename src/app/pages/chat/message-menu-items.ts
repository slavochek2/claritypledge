/**
 * @file message-menu-items.ts
 * @description The actions of one message, as the lists MessageRow shows. `items` is the full list (right-click, long press); `moreItems` is what
 * the toolbar does not carry, so the ⋯ menu never repeats a toolbar button. Moved out of MessageRow.tsx unchanged in behaviour, plus P1652:
 * Copy text (any live message with words, the mirror's replies included) and React (long-press menu only: the toolbar carries its own button).
 * Below 400px (NARROW_QUERY) Forward leaves the toolbar and sits first in the ⋯ menu (`narrow`), because the full toolbar needs about 385px.
 */
import { Copy, Forward, MessageSquareText, MessagesSquare, Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react';
import type { ChatMessage } from '@/app/data/chat-service';
import type { MenuItem } from './chat-kit';
import { copyableText, copyMessageText } from './message-copy';
import type { MessageActions } from './MessageRow';

export interface MenuContext {
  server: ChatMessage | null;
  live: boolean;
  privateHere: boolean;
  agent: boolean;
  mine: boolean;
  ownerOnly: boolean;
  noCopy: boolean;
  voiceNote: boolean;
  narrow: boolean;
  actions: MessageActions;
  startEdit: (body: string) => void;
  /** Where the full menu is open (the picker opens there). */
  menuAt?: { x: number; y: number } | null;
  /** Present only when this message takes reactions. */
  react?: (at: { x: number; y: number }) => void;
}

/** Thread, Forward and Clarify: a person's message only, never the agent's. */
function pushPersonItems(c: MenuContext, server: NonNullable<MenuContext['server']>, items: MenuItem[], moreItems: MenuItem[]) {
  const { actions } = c;
  if (actions.onThread && !server.threadRootId && !c.ownerOnly) {
    const open = actions.onThread;
    items.push({ key: 'thread', label: 'Reply in thread', Icon: MessageSquareText, onSelect: () => open(server) });
  }
  if (!c.noCopy) {
    const forward: MenuItem = { key: 'forward', label: 'Forward', Icon: Forward, onSelect: () => actions.onForward(server) };
    items.push(forward);
    if (c.narrow) moreItems.push(forward);
  }
  if (actions.onClarify && !c.noCopy) {
    const clarify = actions.onClarify;
    items.push({ key: 'clarify', label: 'Clarify', Icon: MessagesSquare, onSelect: () => clarify(server) });
  }
}

export function buildMenuItems(c: MenuContext): { items: MenuItem[]; moreItems: MenuItem[] } {
  const { server, actions } = c;
  const items: MenuItem[] = [];
  const moreItems: MenuItem[] = [];
  // A private row shown in a channel takes no actions there; a mirror reply can only be quoted (never forwarded,
  // clarified, edited or deleted: it is its owner's alone, and the server refuses any copy of it).
  if (!server || !c.live || c.privateHere) return { items, moreItems };
  items.push({ key: 'reply', label: 'Reply', Icon: Reply, onSelect: () => actions.onReply(server) });
  if (c.react) {
    const react = c.react;
    items.push({ key: 'react', label: 'React', Icon: SmilePlus, onSelect: () => react(c.menuAt ?? { x: window.innerWidth / 2 - 130, y: window.innerHeight / 2 }) });
  }
  const text = copyableText(server);
  if (!c.agent) pushPersonItems(c, server, items, moreItems);
  if (text !== null) moreItems.push({ key: 'copy', label: 'Copy text', Icon: Copy, onSelect: () => void copyMessageText(text) });
  if (c.mine && !c.agent) {
    if (!c.voiceNote) moreItems.push({ key: 'edit', label: 'Edit', Icon: Pencil, onSelect: () => c.startEdit(server.body ?? '') });
    moreItems.push({ key: 'delete', label: 'Delete', Icon: Trash2, onSelect: () => actions.onDelete(server), danger: true });
  }
  // Forward is already in the list above; the ⋯ menu repeats it only on a narrow screen.
  items.push(...moreItems.filter((m) => !(c.narrow && m.key === 'forward')));
  return { items, moreItems };
}
