/**
 * @file use-workspace-access.ts
 * @description P1536 W1: who may have the workspace on this address. Access is by OWNERSHIP: the signed-in owner of the canvas (the address's slug is
 * exactly their own), who has a mirror chat. `resolved` says that fact is known (auth and the chat list have answered; a loading list is not "no mirror chat").
 * `workspace` is whether this address may have the workspace at all: eligible AND canvas drafting is not off (3c X4/X13: with drafting off there is no panel, no switcher and no
 * marker, one row; an unknown answer, or a check that could not tell after its retries, keeps it: the panel then shows its unavailable state with Retry). `active` is the workspace marker (or an old `thread=` address) on such a page.
 */
import { useContext } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';
import { normalizeProjectTag } from '@/lib/canvas-boxes';
import { useCanvasDraftsOff } from '@/app/pages/chat/use-canvas-availability';

export function useWorkspaceAccess(params: URLSearchParams) {
  const { handle, projectTag: rawTag } = useParams<{ handle: string; projectTag: string }>();
  const { user, sessionChecked, isLoading } = useAuth();
  const chat = useContext(ChatContext);
  const mirror = chat?.chats.find(c => c.kind === 'mirror') ?? null;
  const resolved = sessionChecked && !isLoading && (!chat || chat.status !== 'loading');
  // EXACT: the server resolves the owner by the exact slug and slugs are case-sensitively unique, so `/p/Victim/` is another person's page for the
  // signed-in `victim`. Whether the viewer owns the canvas is still the page's own read (`isOwner`); this only says the address is theirs.
  const eligible = !!user?.slug && !!handle && handle === user.slug && !!mirror;
  const draftsOff = useCanvasDraftsOff();
  const workspace = eligible && !draftsOff;
  const active = workspace && (params.get(CANVAS_WORKSPACE_PARAM) === '1' || params.has('thread'));
  return { handle, projectTag: normalizeProjectTag(rawTag), mirror, resolved, eligible, workspace, active };
}
