/**
 * @file use-conversation-dialogs.ts
 * @description Which of an open conversation's dialogs (attach, mirror info, rename, block) are open.
 */
import { useState } from 'react';

export function useConversationDialogs() {
  const [attaching, setAttaching] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  return { attaching, setAttaching, renaming, setRenaming, blocking, setBlocking, infoOpen, setInfoOpen };
}

export type ConversationDialogFlags = ReturnType<typeof useConversationDialogs>;
