/** P1604 (founder): the mirror agent's chat is never archived (the server refuses it). One archived earlier can still be unarchived. */
export function canArchiveToggle(chat: { kind: string; archived: boolean }): boolean {
  return chat.kind !== 'mirror' || chat.archived;
}
