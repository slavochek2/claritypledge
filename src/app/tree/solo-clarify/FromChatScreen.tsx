/**
 * @file FromChatScreen.tsx
 * @description P1722 screen 2: Clarify started from a chat with another person. Publish to chat stays, and the draft can now
 * be made public, behind a warning (it came from someone else's conversation). Variant A adds "Create without posting";
 * variant B keeps one action, Publish to chat, and the point's visibility travels with it.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DM_TALK, DRAFTS, ME, MIRROR, OTHER } from './model';
import { Bubble, ChatFrame, ChatPointCard, DraftCard, MakePublicDialog, MirrorTurn, Note, Said, VariantSwitch, type ShareRule } from './parts';
import { allTags, useDraft } from './draft';

type Variant = 'two-actions' | 'publish-only';
type Outcome = null | 'posted' | 'kept';

export function FromChatScreen({ rule }: { rule: ShareRule }) {
  const [variant, setVariant] = useState<Variant>('two-actions');
  const [warn, setWarn] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [draft, update] = useDraft(DRAFTS.dm);
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
        onChange={v => { setVariant(v); setOutcome(null); }}
        options={[{ id: 'two-actions', label: 'A. Publish or just create' }, { id: 'publish-only', label: 'B. Publish to chat only' }]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChatFrame title={OTHER}>
          {DM_TALK.map(m => <Bubble key={m.id} msg={m} name={m.who === 'me' ? ME : OTHER} />)}
          {outcome === 'posted' && (
            <div className="self-end w-full max-w-[92%]">
              <ChatPointCard statement={statement} tags={tags} visibility={draft.visibility} rule={rule} onMakePublic={() => setWarn(true)} />
            </div>
          )}
        </ChatFrame>
        <ChatFrame title={MIRROR} mirror>
          <p className="text-xs text-muted-foreground">Clarifying {ME}&apos;s message from the chat with {OTHER}</p>
          {outcome === null ? (
            <MirrorTurn name={MIRROR}>
              <DraftCard
                draft={draft}
                update={update}
                choose
                onPublicPick={() => setWarn(true)}
                actions={
                  <>
                    {variant === 'two-actions' && (
                      <Button type="button" variant="outline" className="h-11 min-h-11" onClick={() => setOutcome('kept')}>Create without posting</Button>
                    )}
                    <Button type="button" className="h-11 min-h-11" onClick={() => setOutcome('posted')}>Publish to chat</Button>
                  </>
                }
              />
            </MirrorTurn>
          ) : (
            <MirrorTurn name={MIRROR}>
              <Said>
                {outcome === 'posted' ? `Posted in the chat with ${OTHER}` : 'Created, not posted anywhere'}, as a {draft.visibility} point.
                {outcome === 'kept' && ' It is on your profile; share it from here whenever you like.'}
              </Said>
              {outcome === 'kept' && <ChatPointCard statement={statement} tags={tags} visibility={draft.visibility} rule={rule} onMakePublic={() => setWarn(true)} />}
              <Button type="button" variant="outline" className="h-11 min-h-11 self-start" onClick={() => setOutcome(null)}>Back to the draft</Button>
            </MirrorTurn>
          )}
        </ChatFrame>
      </div>
      {warn && <MakePublicDialog source={`your chat with ${OTHER}`} onConfirm={() => update({ visibility: 'public' })} onClose={() => setWarn(false)} />}
    </div>
  );
}
