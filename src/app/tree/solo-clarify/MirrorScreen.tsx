/**
 * @file MirrorScreen.tsx
 * @description P1722 screen 1: Clarify in the Mirror chat itself. Talk (transcribed) and type asides to the Mirror, press
 * Clarify on a message or on the whole chat, and the Mirror drafts a point. There is no chat to post into, so the action is
 * Create point. Variant A chooses Private/Public on the draft; variant B always creates private and the choice comes after.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DRAFTS, ME, MIRROR, MIRROR_TALK, type FakeMessage } from './model';
import { Bubble, ChatFrame, ChatPointCard, ClarifyChip, Confirm, DraftCard, MirrorTurn, Note, VariantSwitch, VisibilityChoice, type ShareRule } from './parts';
import { allTags, useDraft } from './draft';

type Variant = 'choose-first' | 'private-first';
const NEXT = { [DRAFTS.mirror]: DRAFTS.mirrorNext, [DRAFTS.mirrorNext]: DRAFTS.mirror } as Record<string, string>;

export function MirrorScreen({ rule }: { rule: ShareRule }) {
  const [variant, setVariant] = useState<Variant>('choose-first');
  const [clarified, setClarified] = useState(true);
  const [created, setCreated] = useState(false);
  const [source, setSource] = useState<FakeMessage | null>(null);
  const [base, setBase] = useState<string>(DRAFTS.mirror);
  const [draft, update] = useDraft(DRAFTS.mirror);
  const { statement, tags } = allTags(draft);
  // Every Clarify is a fresh draft: the Mirror's text, no tags, private (in B the picker is hidden, so nothing may carry over).
  const [session, setSession] = useState(0);
  const [focusDraft, setFocusDraft] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const fresh = (text: string, focus = false) => { setSession(n => n + 1); setFocusDraft(focus); update({ text, tags: [], visibility: 'private', position: null }); };
  const start = (m: FakeMessage | null) => { setSource(m); setBase(DRAFTS.mirror); setClarified(true); setCreated(false); fresh(DRAFTS.mirror, true); };
  const another = () => { const next = NEXT[base] ?? DRAFTS.mirror; setBase(next); setCreated(false); setClarified(true); fresh(next, true); };
  const reset = () => { setClarified(false); setCreated(false); setSource(null); setBase(DRAFTS.mirror); fresh(DRAFTS.mirror); chip.current?.focus(); };

  return (
    <div className="flex flex-col gap-4">
      <Note>
        <strong>Deciding:</strong> in your own Mirror chat, does the draft ask Private or Public before you create it (A),
        or is every point created private and made public afterwards (B)? Either way the button says
        <em> Create point</em>, not <em>Publish to chat</em>: there is no other chat to post into.
      </Note>
      <VariantSwitch<Variant>
        value={variant}
        onChange={v => { setVariant(v); setCreated(false); setClarified(true); fresh(base); }}
        options={[{ id: 'choose-first', label: 'A. Choose before creating' }, { id: 'private-first', label: 'B. Always private first' }]}
      />
      <ChatFrame title={MIRROR} mirror action={<ClarifyChip ref={chip} onClick={() => start(null)} label="Clarify" />}>
        {MIRROR_TALK.map(m => <Bubble key={m.id} msg={m} name={ME} onClarify={start} />)}
        {clarified && !created && (
          <MirrorTurn name={MIRROR}>
            <p className="text-xs text-muted-foreground">{source ? `Clarifying your message from ${source.time}` : 'Clarifying the whole chat'}</p>
            <p className="text-sm">Here is the point I hear in what you said and what you meant:</p>
            <DraftCard
              key={session}
              focus={focusDraft}
              focusLabel={source ? `New draft point from your message at ${source.time}` : 'New draft point from the whole chat'}
              draft={draft}
              update={update}
              choose={variant === 'choose-first'}
              actions={
                <>
                  <Button type="button" variant="outline" className="h-11 min-h-11" onClick={another}>Another point</Button>
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
            <Confirm>Created. {draft.visibility === 'private' ? 'Only you can see it' : 'It is on your profile for anyone to see'}.</Confirm>
            <ChatPointCard statement={statement} tags={tags} visibility={draft.visibility} rule={rule} onMakePublic={() => update({ visibility: 'public' })} position={draft.position} onPosition={p => update({ position: p })} />
            {variant === 'private-first' && (
              <div className="flex flex-col gap-1">
                <span aria-hidden className="text-xs text-muted-foreground">Who can see it (change any time)</span>
                <VisibilityChoice label="Who can see it (change any time)" value={draft.visibility} onChange={v => update({ visibility: v })} />
              </div>
            )}
            <Button type="button" variant="ghost" className="h-11 min-h-11 self-start" onClick={reset}>Back to the chat</Button>
          </MirrorTurn>
        )}
      </ChatFrame>
    </div>
  );
}
