/**
 * @file FromChatScreen.tsx
 * @description P1722 screen 2: Clarify started from a chat with another person. Publish to chat stays, and the draft can now
 * be made public, behind a warning (it came from someone else's conversation). Variant A adds "Create without posting";
 * variant B keeps one action, Publish to chat, and the point's visibility travels with it.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DM_TALK, DRAFTS, ME, MIRROR, OTHER, type Visibility } from './model';
import { Bubble, ChatFrame, Arrive, ChatPointCard, Confirm, DraftCard, MakePublicDialog, MirrorTurn, Note, VariantSwitch, type ShareRule } from './parts';
import { allTags, useDraft } from './draft';

type Variant = 'two-actions' | 'publish-only';
type Outcome = null | 'posted' | 'kept';

export function FromChatScreen({ rule }: { rule: ShareRule }) {
  const [variant, setVariant] = useState<Variant>('two-actions');
  const [warn, setWarn] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [madeAs, setMadeAs] = useState<Visibility>('private');
  const [draft, update] = useDraft(DRAFTS.dm);
  const finish = (o: Exclude<Outcome, null>) => { setMadeAs(draft.visibility); setOutcome(o); };
  const [session, setSession] = useState(0);
  const [focusDraft, setFocusDraft] = useState(false);
  // Start over is a new Clarify: the posted card leaves the chat and the draft is fresh and private again.
  const startOver = (focus = false) => { setSession(n => n + 1); setFocusDraft(focus); setOutcome(null); update({ text: DRAFTS.dm, tags: [], visibility: 'private', position: null }); };
  const { statement, tags } = allTags(draft);

  return (
    <div className="flex flex-col gap-4">
      <Note>
        <strong>Deciding:</strong> when Clarify starts in a chat with {OTHER}, the point still posts back there, and you may
        now make it public (a warning first). Is there a second way out, <em>Create without posting</em> (A), or only
        <em> Publish to chat</em> (B)? Try switching the draft to Public to see the warning.
      </Note>
      <VariantSwitch<Variant>
        value={variant}
        onChange={v => { setVariant(v); startOver(); }}
        options={[{ id: 'two-actions', label: 'A. Publish or just create' }, { id: 'publish-only', label: 'B. Publish to chat only' }]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChatFrame title={OTHER}>
          {DM_TALK.map(m => <Bubble key={m.id} msg={m} name={m.who === 'me' ? ME : OTHER} />)}
          {outcome === 'posted' && (
            <Arrive label={`Posted in the chat with ${OTHER}, as a ${madeAs} point`} className="self-end w-full max-w-[92%]">
              <ChatPointCard statement={statement} tags={tags} visibility={draft.visibility} rule={rule} onMakePublic={() => setWarn(true)} position={draft.position} onPosition={p => update({ position: p })} />
            </Arrive>
          )}
        </ChatFrame>
        <ChatFrame title={MIRROR} mirror>
          <p className="text-xs text-muted-foreground">Clarifying {ME}&apos;s message from the chat with {OTHER}</p>
          {outcome === null ? (
            <MirrorTurn name={MIRROR}>
              <DraftCard
                key={session}
                focus={focusDraft}
                draft={draft}
                update={update}
                choose
                onPublicPick={() => setWarn(true)}
                actions={
                  <>
                    {variant === 'two-actions' && (
                      <Button type="button" variant="outline" className="h-11 min-h-11" onClick={() => finish('kept')}>Create without posting</Button>
                    )}
                    <Button type="button" className="h-11 min-h-11" onClick={() => finish('posted')}>Publish to chat</Button>
                  </>
                }
              />
            </MirrorTurn>
          ) : (
            <MirrorTurn name={MIRROR}>
              <Confirm focus={outcome === 'kept'}>
                {outcome === 'posted' ? `Posted in the chat with ${OTHER}` : 'Created, not posted anywhere'}, as a {madeAs} point.
                {outcome === 'kept' && ' Share it from here whenever you like.'}
              </Confirm>
              {outcome === 'kept' && <ChatPointCard statement={statement} tags={tags} visibility={draft.visibility} rule={rule} onMakePublic={() => setWarn(true)} position={draft.position} onPosition={p => update({ position: p })} />}
              <Button type="button" variant="outline" className="h-11 min-h-11 self-start" onClick={() => startOver(true)}>Start over</Button>
            </MirrorTurn>
          )}
        </ChatFrame>
      </div>
      {warn && <MakePublicDialog source={`your chat with ${OTHER}`} onConfirm={() => update({ visibility: 'public' })} onClose={() => setWarn(false)} />}
    </div>
  );
}
