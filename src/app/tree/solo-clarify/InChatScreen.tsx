/**
 * @file InChatScreen.tsx
 * @description P1722 screen 3: points as a chat shows them. Each carries the private lock or the public globe in front of its
 * statement, and Share. The page-level share rule decides what Share does on a private point. Where a point came from decides
 * whether making it public warns first: from your own Mirror chat it does not, from a chat with someone else it does (screen 2).
 */
import { useState } from 'react';
import { DRAFTS, ME, OTHER, type Visibility } from './model';
import { ChatFrame, ChatPointCard, MakePublicDialog, Note, type ShareRule } from './parts';

type From = 'mirror' | 'chat';

const POINTS: { id: string; statement: string; visibility: Visibility; from: From }[] = [
  { id: 'a', statement: DRAFTS.mirror, visibility: 'private', from: 'mirror' },
  { id: 'b', statement: 'Feedback lands when it names what was heard before what was wrong.', visibility: 'private', from: 'chat' },
  { id: 'c', statement: DRAFTS.dm, visibility: 'public', from: 'chat' },
];

const FROM: Record<From, string> = { mirror: 'From your Mirror chat', chat: `From your chat with ${OTHER}` };

export function InChatScreen({ rule }: { rule: ShareRule }) {
  const [vis, setVis] = useState<Record<string, Visibility>>(Object.fromEntries(POINTS.map(p => [p.id, p.visibility])));
  const [warnFor, setWarnFor] = useState<string | null>(null);
  const makePublic = (id: string) => setVis(v => ({ ...v, [id]: 'public' }));
  return (
    <div className="flex flex-col gap-4">
      <Note>
        <strong>Deciding:</strong> every point in a chat shows whether it is private (lock) or public (globe). A point
        attached to a message already does; you saw one without it, likely the card Clarify posts (to check before a spec). What does Share do on a <em>private</em> point? Switch the share rule at the top of the page:
        <em> Public only</em> keeps Share off with a reason and a Make public link; <em>Share with people</em> lets you pick
        who may see it, which is what the product&apos;s private lock already promises (&quot;Only people you share with can see this&quot;).
        Making the point from the chat with {OTHER} public warns first; the one from your Mirror chat does not.
      </Note>
      <ChatFrame title={`${ME}'s chat`}>
        {POINTS.map(p => {
          const v = vis[p.id] ?? p.visibility;
          return (
            <div key={p.id} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{v === 'private' ? 'A private point' : 'A public point'} · {FROM[p.from]}</span>
              <ChatPointCard statement={p.statement} tags={[]} visibility={v} rule={rule} onMakePublic={() => (p.from === 'chat' ? setWarnFor(p.id) : makePublic(p.id))} />
            </div>
          );
        })}
      </ChatFrame>
      {warnFor && <MakePublicDialog source={`your chat with ${OTHER}`} onConfirm={() => makePublic(warnFor)} onClose={() => setWarnFor(null)} />}
    </div>
  );
}
