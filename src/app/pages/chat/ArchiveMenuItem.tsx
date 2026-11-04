/**
 * @file ArchiveMenuItem.tsx
 * @description The Archive / Unarchive menu item of a chat, in the list row's menu and the conversation header's menu. P1604 (founder):
 * the mirror agent's chat is never archived, so it shows nothing unless an earlier archive left it archived, when it offers Unarchive.
 */
import { Archive, ArchiveRestore } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { ChatSummary } from '@/app/data/chat-mappers';
import { canArchiveToggle } from './archive-rule';

export function ArchiveMenuItem({ chat, onSelect }: { chat: Pick<ChatSummary, 'kind' | 'archived'>; onSelect: () => void }) {
  if (!canArchiveToggle(chat)) return null;
  const Icon = chat.archived ? ArchiveRestore : Archive;
  return (
    <DropdownMenuItem className="min-h-10" onSelect={onSelect}>
      <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
      {chat.archived ? 'Unarchive' : 'Archive'}
    </DropdownMenuItem>
  );
}
