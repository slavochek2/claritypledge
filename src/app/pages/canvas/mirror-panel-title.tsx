/**
 * @file mirror-panel-title.tsx
 * @description P1536 3c X8: the mirror agent is visibly there in the workspace's thread panel. Two pieces, both read from the OWNER's mirror (its name is
 * the mirror's own `title`, never written here; a mirror never renamed reads as its role alone, as in the chat header):
 *  - the panel header: the mirror's face and name with "Your mirror agent", as the mirror chat's header draws them (× is the thread header's);
 *  - the line a draft with a base opens with: "This is a new draft from vN. Tell me what to change. Readers keep seeing vN until you publish." It is
 *    drawn on screen from the base's number: not stored, not given to the model, not counted as a message.
 */
import type { ReactNode } from 'react';
import { MirrorMark, MirrorTitle } from '@/app/pages/chat/chat-kit';
import { mirrorLabel } from '@/app/pages/chat/chat-view-model';
import { baseDraftLine } from '@/app/pages/chat/canvas-thread-copy';
import type { ChatSummary } from '@/app/data/chat-service';

type MirrorNames = Pick<ChatSummary, 'title' | 'ownerFirstName'>;

/** The panel header's title: the mirror's face, then "<name> · Your mirror agent" on one line (the role is never the part that gets cut). */
export function MirrorPanelTitle({ mirror }: { mirror: MirrorNames }): ReactNode {
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="canvas-thread-title">
      <MirrorMark size="sm" />
      <h2 className="flex min-w-0 text-base font-semibold text-foreground" aria-label={mirrorLabel(mirror)}>
        <MirrorTitle chat={mirror} />
      </h2>
    </div>
  );
}

/** The mirror agent's opening line of a draft with a base (`seq` null: the version is unknown, the sentence says "this version"). */
export function MirrorAgentLine({ mirror, seq }: { mirror: MirrorNames; seq: number | null }) {
  return (
    <div className="flex items-start gap-2 px-4 py-3" data-testid="agent-line">
      <MirrorMark size="sm" className="mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{mirror.title ?? 'Your mirror agent'}</p>
        <p className="mt-0.5 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{baseDraftLine(seq)}</p>
      </div>
    </div>
  );
}
