/**
 * @file OneMicScreen.tsx
 * @description P1722 screen 4: one microphone, two people, only one of them a user. Recorded in the Mirror chat, Clarify drafts a
 * point from the conversation. Going public uses words of someone who never agreed to anything. The variants are the three
 * consent rules the founder has to choose between; none is the product's yet.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DRAFTS, ME, MIRROR, ONE_MIC_TALK, OTHER } from './model';
import { Bubble, ChatFrame, ChatPointCard, ClarifyChip, DraftCard, MakePublicDialog, MirrorTurn, Note, VariantSwitch, type ShareRule } from './parts';
import { allTags, useDraft } from './draft';

type Variant = 'confirm' | 'my-words' | 'trust';

const ONLY_MINE = 'Launch the course in spring, with a smaller promise rather than a smaller course.';

export function OneMicScreen({ rule }: { rule: ShareRule }) {
  const [variant, setVariant] = useState<Variant>('confirm');
  const [warn, setWarn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [created, setCreated] = useState(false);
  const [draft, update] = useDraft(DRAFTS.oneMic);
  const { statement, tags } = allTags(draft);
  const [session, setSession] = useState(0);
  const fresh = (v: Variant) => {
    setSession(n => n + 1); setCreated(false); setAgreed(false);
    update({ visibility: 'private', tags: [], position: null, text: v === 'my-words' ? ONLY_MINE : DRAFTS.oneMic });
  };
  const choose = (v: Variant) => { setVariant(v); fresh(v); };

  const consent = variant === 'confirm' ? (
    <label className="flex min-h-11 items-start gap-3 text-sm">
      <Checkbox checked={agreed} onCheckedChange={c => setAgreed(c === true)} className="mt-0.5" />
      <span>{OTHER} agreed that what they said can be part of a public point.</span>
    </label>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <Note>
        <strong>Deciding (yours, not mine):</strong> a recording on one microphone holds someone else&apos;s words. Before a
        point built on them goes public: (A) you confirm the other person agreed; (B) the Mirror drafts from your words only,
        so there is nothing of theirs to consent to; (C) the usual warning only, it is your call. The speakers are named
        from the transcription (&quot;Speaker 1&quot;, &quot;Speaker 2&quot;), which already works on one mic.
      </Note>
      <VariantSwitch<Variant>
        value={variant}
        onChange={choose}
        options={[{ id: 'confirm', label: 'A. Confirm they agreed' }, { id: 'my-words', label: 'B. Only my words' }, { id: 'trust', label: 'C. Warning only' }]}
      />
      <ChatFrame title={MIRROR} mirror action={<ClarifyChip onClick={() => fresh(variant)} label="Clarify recording" />}>
        <p className="text-xs text-muted-foreground">Recording on this device · Speaker 1 is {ME}, Speaker 2 is {OTHER}, not on Clarity Pledge</p>
        {ONE_MIC_TALK.map(m => <Bubble key={m.id} msg={m} name={m.who === 'me' ? ME : OTHER} />)}
        {!created ? (
          <MirrorTurn name={MIRROR}>
            <p className="text-sm">{variant === 'my-words' ? 'From what you said (Speaker 1 only):' : 'From the conversation:'}</p>
            <DraftCard
              key={session}
              draft={draft}
              update={update}
              choose
              onPublicPick={variant === 'my-words' ? undefined : () => setWarn(true)}
              actions={<Button type="button" className="h-11 min-h-11" onClick={() => setCreated(true)}>{draft.visibility === 'public' ? 'Create public point' : 'Create point'}</Button>}
            />
          </MirrorTurn>
        ) : (
          <MirrorTurn name={MIRROR}>
            {/* B drafts from your words only, so there is nothing of theirs to warn about, before creation or after */}
            <p className="text-sm">Created. It is on your profile{draft.visibility === 'private' ? ', visible only to you' : ' for anyone'}.</p>
            <ChatPointCard statement={statement} tags={tags} visibility={draft.visibility} rule={rule} onMakePublic={() => (variant === 'my-words' ? update({ visibility: 'public' }) : setWarn(true))} position={draft.position} onPosition={p => update({ position: p })} />
            <Button type="button" variant="outline" className="h-11 min-h-11 self-start" onClick={() => fresh(variant)}>Start over</Button>
          </MirrorTurn>
        )}
      </ChatFrame>
      {warn && (
        <MakePublicDialog
          source={`a recording with ${OTHER}, who is not on Clarity Pledge`}
          extra={consent}
          blocked={variant === 'confirm' && !agreed ? `Tick the box once ${OTHER} has agreed, or keep the point private.` : undefined}
          onConfirm={() => update({ visibility: 'public' })}
          onClose={() => { setWarn(false); setAgreed(false); }}
        />
      )}
    </div>
  );
}

