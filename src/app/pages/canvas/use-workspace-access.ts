/**
 * @file use-workspace-access.ts
 * @description P1536 W1: who may have the workspace on this address. Access is by OWNERSHIP: the signed-in owner of the canvas, who has a
 * mirror chat. `resolved` says that fact is known (auth and the chat list have answered; a loading list is not "no mirror chat").
 * `active` is the workspace marker (or an old `thread=` address) on an eligible page.
 */
import { useContext } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';
import { normalizeProjectTag } from '@/lib/canvas-boxes';

export function useWorkspaceAccess(params: URLSearchParams) {
  const { handle, projectTag: rawTag } = useParams<{ handle: string; projectTag: string }>();
  const { user, sessionChecked, isLoading } = useAuth();
  const chat = useContext(ChatContext);
  const mirror = chat?.chats.find(c => c.kind === 'mirror') ?? null;
  const resolved = sessionChecked && !isLoading && (!chat || chat.status !== 'loading');
  const eligible = !!user?.slug && !!handle && handle.toLowerCase() === user.slug.toLowerCase() && !!mirror;
  const active = eligible && (params.get(CANVAS_WORKSPACE_PARAM) === '1' || params.has('thread'));
  return { handle, projectTag: normalizeProjectTag(rawTag), mirror, resolved, eligible, active };
}
