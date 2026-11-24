/**
 * @file MirrorScreen.tsx
 * @description P1722 screen 1: Clarify in the Mirror chat itself. Talk (transcribed) and type asides to the Mirror, press
 * Clarify on a message or on the whole chat, and the Mirror drafts a point. There is no chat to post into, so the action is
 * Create point. Variant A chooses Private/Public on the draft; variant B always creates private and the choice comes after.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ME, MIRROR_TALK, DRAFTS } from './model';
import { Bubble, ChatFrame, ChatPointCard, ClarifyChip, DraftCard, MirrorTurn, Note, VariantSwitch, VisibilityChoice, type ShareRule } from './parts';
import { allTags, useDraft } from './draft';

type Variant = 'choose-first' | 'private-first';
const MIRROR = "Sam's mirror";

export function MirrorScreen({ rule }: { rule: ShareRule }) {
  const [variant, setVariant] = useState<Variant>('choose-first');
  const [clarified, setClarified] = useState(true);
  const [created, setCreated] = useState(false);
  const [draft, update] = useDraft(DRAFTS.mirror);
  const { statement, tags } = allTags(draft);
  const start = () => { setClarified(true); setCreated(false); };
  const reset = () => { setClarified(false); setCreated(false); update({ visibility: 'private', position: null }); };

  return (
    <div className="flex flex-col gap-4">
      <Note>
        <strong>Deciding:</strong> in your own Mirror chat, does the draft ask Private or Public before you create it (A),
        or is every point created private and made public afterwards (B)? Either way the button says
        <em> Create point</em>, not <em>Publish to chat</em>: there is no other chat to post into.
      </Note>
      <VariantSwitch<Variant>
        value={variant}
        onChange={v => { setVariant(v); setCreated(false); update({ visibility: 'private' }); }}
        options={[{ id: 'choose-first', label: 'A. Choose before creating' }, { id: 'private-first', label: 'B. Always private first' }]}
      />
      <ChatFrame title={MIRROR} mirror action={<ClarifyChip onClick={start} label="Clarify" />}>
        {MIRROR_TALK.map(m => <Bubble key={m.id} msg={m} name={ME} onClarify={start} />)}
        {clarified && !created && (
          <MirrorTurn name={MIRROR}>
            <p className="text-sm">Here is the point I hear in what you said and what you meant:</p>
            <DraftCard
              draft={draft}
              update={update}
              choose={variant === 'choose-first'}
              actions={
                <>
                  <Button type="button" variant="outline" className="h-11 min-h-11" onClick={reset}>Another point</Button>
                  <Button type="button" className="h-11 min-h-11" onClick={() => setCreated(true)}>
                    {variant === 'choose-first' && draft.visibility === 'public' ? 'Create public point' : 'Create point'}
                  </Button>
                </>
              }
            />
          </MirrorTurn>
        )}
        {created && (
          <MirrorTurn name={MIRROR}>
            <p className="text-sm">Created. It is on your profile{draft.visibility === 'private' ? ', visible only to you' : ' for anyone'}.</p>
            <ChatPointCard statement={statement} tags={tags} visibility={draft.visibility} rule={rule} onMakePublic={() => update({ visibility: 'public' })} />
            {variant === 'private-first' && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Who can see it (change any time)</span>
                <VisibilityChoice value={draft.visibility} onChange={v => update({ visibility: v })} />
              </div>
            )}
            <Button type="button" variant="outline" className="h-11 min-h-11 self-start" onClick={reset}>Start over</Button>
          </MirrorTurn>
        )}
      </ChatFrame>
    </div>
  );
}
