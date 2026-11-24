/**
 * @file InChatScreen.tsx
 * @description P1722 screen 3: points as a chat shows them. Each carries the private lock or the public globe in front of its
 * statement, and Share. The page-level share rule decides what Share does on a private point; this screen shows both points
 * side by side so the rule can be judged.
 */
import { useState } from 'react';
import { ME } from './model';
import { ChatFrame, ChatPointCard, Note, type ShareRule } from './parts';
import type { Visibility } from './model';

const POINTS: { id: string; statement: string; visibility: Visibility }[] = [
  { id: 'a', statement: 'Being restated correctly is what lets people change their mind, not the strength of the arguments.', visibility: 'private' },
  { id: 'b', statement: 'Team meetings run long because nobody is sure what was decided, not because nobody prepares.', visibility: 'public' },
];

export function InChatScreen({ rule }: { rule: ShareRule }) {
  const [vis, setVis] = useState<Record<string, Visibility>>(Object.fromEntries(POINTS.map(p => [p.id, p.visibility])));
  return (
    <div className="flex flex-col gap-4">
      <Note>
        <strong>Deciding:</strong> every point in a chat shows whether it is private (lock) or public (globe). A point
        attached to a message already does; you saw one without it, likely the card Clarify posts (to check before a spec). What does Share do on a <em>private</em> point? Switch the share rule at the top of the page:
        <em> Public only</em> keeps Share off with a reason and a Make public link; <em>Share with people</em> lets you pick
        who may see it, which is what the product&apos;s private lock already promises (&quot;Only people you share with can see this&quot;).
      </Note>
      <ChatFrame title={`${ME}'s chat`}>
        {POINTS.map(p => (
          <div key={p.id} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{(vis[p.id] ?? p.visibility) === 'private' ? 'A private point' : 'A public point'}</span>
            <ChatPointCard statement={p.statement} tags={[]} visibility={vis[p.id] ?? p.visibility} rule={rule} onMakePublic={() => setVis(v => ({ ...v, [p.id]: 'public' }))} />
          </div>
        ))}
      </ChatFrame>
    </div>
  );
}
