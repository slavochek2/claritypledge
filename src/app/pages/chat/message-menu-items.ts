/**
 * @file message-menu-items.ts
 * @description The one menu of a message: right-click, the ⋯ button and a phone's long press all open the same list, in this order: Clarify, Reply, Reply in thread, Forward,
 * Copy text, Edit, Delete (the reactions strip sits above it, drawn by PopMenu). Each item shows only where it did before: no Clarify in the mirror itself or on the mirror's replies,
 * no Forward or Clarify on private items or voice notes, Edit and Delete only on your own words. The hover bar carries only Clarify and ⋯ (MessageToolbar).
 */
import { Copy, Forward, MessageSquareText, Pencil, Reply, Trash2 } from 'lucide-react';
import type { ChatMessage } from '@/app/data/chat-service';
import type { MenuItem } from './chat-kit';
import { ClarifyMenuIcon } from './MessageParts';
import { copyableText, copyMessageText } from './message-copy';
import { isKnownPrivatePoint } from './private-point-cache';
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
  actions: MessageActions;
  startEdit: (body: string) => void;
}

/** Clarify, then Reply, Reply in thread and Forward: a person's message only for the ones that copy it, never the agent's. */
function pushActionItems(c: MenuContext, server: NonNullable<MenuContext['server']>, items: MenuItem[]) {
  const { actions } = c;
  if (!c.agent && actions.onClarify && !c.noCopy) {
    const clarify = actions.onClarify;
    items.push({ key: 'clarify', label: 'Clarify', Icon: ClarifyMenuIcon, onSelect: () => clarify(server) });
  }
  items.push({ key: 'reply', label: 'Reply', Icon: Reply, onSelect: () => actions.onReply(server) });
  if (!c.agent && actions.onThread && !server.threadRootId && !c.ownerOnly) {
    const open = actions.onThread;
    items.push({ key: 'thread', label: 'Reply in thread', Icon: MessageSquareText, onSelect: () => open(server) });
  }
  const privatePoint = server.attachmentKind === 'point' && isKnownPrivatePoint(server.attachmentId); // P1631: a private point is never forwarded
  if (!c.agent && !c.noCopy && !privatePoint) items.push({ key: 'forward', label: 'Forward', Icon: Forward, onSelect: () => actions.onForward(server) });
}

export function buildMenuItems(c: MenuContext): MenuItem[] {
  const { server, actions } = c;
  const items: MenuItem[] = [];
  // A private row shown in a channel takes no actions there; a mirror reply can only be quoted (never forwarded,
  // clarified, edited or deleted: it is its owner's alone, and the server refuses any copy of it).
  if (!server || !c.live || c.privateHere) return items;
  pushActionItems(c, server, items);
  const text = copyableText(server);
  if (text !== null) items.push({ key: 'copy', label: 'Copy text', Icon: Copy, onSelect: () => void copyMessageText(text) });
  if (c.mine && !c.agent) {
    if (!c.voiceNote) items.push({ key: 'edit', label: 'Edit', Icon: Pencil, onSelect: () => c.startEdit(server.body ?? '') });
    items.push({ key: 'delete', label: 'Delete', Icon: Trash2, onSelect: () => actions.onDelete(server), danger: true });
  }
  return items;
}
