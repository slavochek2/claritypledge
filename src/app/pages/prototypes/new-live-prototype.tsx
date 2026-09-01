/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';

// ============================================================
// P562 New /live Prototype — Self-contained, mock data only
// Flow: Join → Role Claim → Sealed Bid → Paraphrase → Sliders Unlock
// ============================================================

type SessionMode = 'guided' | 'sliders';
type FlowStep = 'join' | 'role-claim' | 'session' | 'summary';
type Role = 'speaker' | 'listener';

// Free mode phases:
// sealed-bid: Initial assessment. Both submit sealed.
// waiting: Waiting for partner's sealed bid
// reveal: Both numbers shown. Gap visible. Auto-transitions to paraphrase.
// paraphrase: Listener paraphrases verbally. Clicks "I paraphrased" → unlocks sliders.
// unlocked: Sliders unlock for continuous updates.
type FreePhase = 'sealed-bid' | 'waiting' | 'reveal' | 'paraphrase' | 'unlocked';

interface MockStory {
  id: string;
  title: string;
  owner: 'me' | 'partner';
}

interface RoundRecord {
  listenerConfidence: number;
  speakerBelief: number;
  label: string;
}

const MOCK_STORIES: MockStory[] = [
  { id: '1', title: 'Budget Planning Disagreement', owner: 'me' },
  { id: '2', title: 'Remote Work Policy', owner: 'me' },
  { id: '3', title: 'Hiring Timeline', owner: 'partner' },
];

const PARTNER_NAME = 'Alex';

// ── Shared Components ───────────────────────────────────────

function SliderTrack({
  value,
  onChange,
  label,
  sublabel,
  readonly = false,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  label: string;
  sublabel?: string;
  readonly?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const textColor = readonly ? 'text-gray-500' : 'text-gray-900';
  const dotColor = readonly ? 'bg-gray-400' : 'bg-blue-500';
  const fillColor = readonly ? '#d1d5db' : '#3b82f6';
  const trackBg = readonly ? '#f3f4f6' : '#eff6ff';

  const handleTrackInteraction = useCallback((clientX: number) => {
    if (readonly || !trackRef.current || !onChange) return;
    const rect = trackRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(Math.round(fraction * 10));
  }, [readonly, onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (readonly) return;
    handleTrackInteraction(e.clientX);
    const onMove = (ev: PointerEvent) => handleTrackInteraction(ev.clientX);
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [readonly, handleTrackInteraction]);

  return (
    <div className={`w-full ${readonly ? 'opacity-75' : ''}`}>
      {label && (
        <div className="flex justify-between items-baseline mb-1.5">
          <div>
            <span className={`text-sm font-medium ${textColor}`}>{label}</span>
            {sublabel && <span className="text-xs text-gray-400 ml-2">{sublabel}</span>}
          </div>
          <span className={`text-xl font-light tabular-nums ${textColor}`}>
            {value !== null ? `${value}/10` : ''}
          </span>
        </div>
      )}
      {!label && value !== null && (
        <div className="flex justify-end mb-1">
          <span className="text-xl font-light tabular-nums text-gray-900">{value}/10</span>
        </div>
      )}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        className={`relative w-full rounded-full ${readonly ? 'h-1.5' : 'h-2.5'} ${!readonly ? 'cursor-pointer' : ''}`}
        style={{ background: trackBg, touchAction: 'none' }}
      >
        {value !== null && (
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-150"
            style={{ width: `${value * 10}%`, background: fillColor }}
          />
        )}
        {value !== null && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-md transition-all duration-150
              ${dotColor} ${readonly ? 'w-4 h-4' : 'w-7 h-7 -mt-px ring-4 ring-white'}`}
            style={{ left: `calc(${value * 10}% - ${readonly ? '8px' : '14px'})` }}
          />
        )}
      </div>
      {label && (
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400">0</span>
          {!readonly && <span className="text-[10px] text-gray-300">Understanding</span>}
          <span className="text-[10px] text-gray-400">10</span>
        </div>
      )}
    </div>
  );
}

function DotBar({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-px text-xs tracking-tight">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < value ? 'text-foreground' : 'text-gray-300'}>●</span>
      ))}
    </span>
  );
}

function MutualTenCelebration() {
  return (
    <div className="text-center py-2 animate-pulse">
      <span className="text-green-600 font-serif text-sm">✦ Both at 10 ✦</span>
    </div>
  );
}

function AppHeader({ onEnd }: { onEnd?: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <span className="font-semibold text-gray-900">Clarity Pledge</span>
        </div>
        <div className="flex items-center gap-3">
          {onEnd && (
            <button onClick={onEnd} className="text-sm text-red-500 font-medium">← End Session</button>
          )}
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-red-600 text-xs font-bold">V</span>
          </div>
        </div>
      </div>
      <div className="text-center py-2 text-xs text-blue-500 bg-blue-50/50 border-b border-blue-100/50">
        ✦ Session recorded for AI Insights
      </div>
    </>
  );
}

function StoryCard({ story }: { story: MockStory }) {
  return (
    <div className="bg-white rounded-lg border-l-4 border-l-blue-500 border border-border shadow-sm p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
          <span className="text-gray-500 text-sm font-bold">{story.owner === 'me' ? 'V' : 'A'}</span>
        </div>
        <div>
          <p className="text-sm font-medium">
            {story.owner === 'me' ? 'Vyacheslav Ladischenski' : PARTNER_NAME}
            <span className="text-muted-foreground text-xs ml-1">♪ 0</span>
          </p>
          <p className="text-xs text-blue-500">Fractional Chief Clarity Officer · Mar 17 🌐</p>
        </div>
      </div>
      <p className="text-sm text-gray-700 mb-1">
        I had fourteen co-founders. Nine separations. None of us wanted them. Most of the friction was unnec...
      </p>
      <p className="text-xs text-blue-500 mb-2">Show more</p>
      <p className="text-xs text-gray-400">› 2 points</p>
    </div>
  );
}

function ModePill({
  mode,
  onChange,
}: {
  mode: SessionMode;
  onChange: (m: SessionMode) => void;
}) {
  return (
    <div className="inline-flex bg-gray-100 rounded-full p-1 text-sm">
      <button
        onClick={() => onChange('sliders')}
        className={`px-4 py-1.5 rounded-full transition-all ${
          mode === 'sliders' ? 'bg-blue-500 text-white shadow-sm font-medium' : 'text-gray-500'
        }`}
      >
        Free mode
      </button>
      <button
        onClick={() => onChange('guided')}
        className={`px-4 py-1.5 rounded-full transition-all ${
          mode === 'guided' ? 'bg-blue-500 text-white shadow-sm font-medium' : 'text-gray-500'
        }`}
      >
        Guided mode
      </button>
    </div>
  );
}

// ── Flow Steps ──────────────────────────────────────────────

function JoinStep({ onJoin }: { onJoin: () => void }) {
  const [code, setCode] = useState('');
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <h1 className="font-serif text-2xl mb-8">Clarity Session</h1>
      <div className="w-full max-w-xs space-y-4">
        <button onClick={onJoin} className="w-full py-4 bg-blue-500 text-white rounded-xl text-lg font-medium hover:bg-blue-600 transition-colors">
          Start new session
        </button>
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <div className="flex-1 h-px bg-gray-200" />or join<div className="flex-1 h-px bg-gray-200" />
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Enter code" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            className="flex-1 px-4 py-3 border border-border rounded-xl text-center text-lg tracking-widest" maxLength={4} />
          <button onClick={onJoin} disabled={code.length < 4} className="px-6 py-3 bg-gray-900 text-white rounded-xl disabled:opacity-30 transition-opacity">Join</button>
        </div>
      </div>
    </div>
  );
}

function RoleClaimStep({
  mode,
  onModeChange,
  onRoleClaim,
}: {
  mode: SessionMode;
  onModeChange: (m: SessionMode) => void;
  onRoleClaim: (role: Role, story?: MockStory) => void;
}) {
  const [showStories, setShowStories] = useState(false);
  const [selectedStory, setSelectedStory] = useState<MockStory | undefined>();
  const [storySearch, setStorySearch] = useState('');
  const filteredStories = MOCK_STORIES.filter(s =>
    s.title.toLowerCase().includes(storySearch.toLowerCase())
  );

  const handleModeChange = useCallback((m: SessionMode) => {
    onModeChange(m);
    toast(m === 'sliders' ? 'Free mode' : 'Guided mode');
  }, [onModeChange]);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <AppHeader />

      {/* Story card + role claim buttons */}
      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full px-6 pt-6">
        {/* Story card (if selected) */}
        {selectedStory && (
          <div className="mb-4">
            <StoryCard story={selectedStory} />
          </div>
        )}

        {/* Role claim buttons */}
        <div className="space-y-3">
          {selectedStory ? (
            <>
              {selectedStory.owner === 'me' && (
                <button
                  onClick={() => onRoleClaim('speaker', selectedStory)}
                  className="w-full py-4 bg-blue-500 text-white rounded-lg text-base font-medium hover:bg-blue-600 transition-colors"
                >
                  Does <span className="font-bold">{PARTNER_NAME}</span> understand you?
                </button>
              )}
              <button
                onClick={() => { setSelectedStory(undefined); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto block min-h-[44px]"
              >
                Speak freely
              </button>
            </>
          ) : (
            <button
              onClick={() => onRoleClaim('speaker', selectedStory)}
              className="w-full py-4 bg-blue-500 text-white rounded-lg text-base font-medium hover:bg-blue-600 transition-colors"
            >
              Does <span className="font-bold">{PARTNER_NAME}</span> understand you?
            </button>
          )}
        </div>

        {/* Story selection */}
        <div className="mt-4 min-h-[44px]">
          {!showStories ? (
            !selectedStory ? (
              <button onClick={() => setShowStories(true)} className="text-sm text-blue-500 hover:text-blue-700 mx-auto block min-h-[44px]">
                Select your story
              </button>
            ) : null
          ) : (
            <div className="space-y-2">
              <input type="text" placeholder="Search stories..." value={storySearch} onChange={e => setStorySearch(e.target.value)}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100" autoFocus />
              {filteredStories.map(story => (
                <button key={story.id} onClick={() => { setSelectedStory(story); setShowStories(false); setStorySearch(''); }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-border hover:border-gray-300 text-sm transition-all">
                  <span className="font-medium">{story.title}</span>
                  <span className="text-gray-400 ml-2 text-xs">{story.owner === 'me' ? '(yours)' : `(${PARTNER_NAME}'s)`}</span>
                </button>
              ))}
              {filteredStories.length === 0 && storySearch && (
                <p className="text-xs text-gray-400 text-center py-2">No stories match &ldquo;{storySearch}&rdquo;</p>
              )}
              <button onClick={() => { setShowStories(false); setStorySearch(''); }} className="text-xs text-gray-400 hover:text-gray-600 mx-auto block">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Mode toggle at bottom */}
      <div className="flex justify-center py-4">
        <ModePill mode={mode} onChange={handleModeChange} />
      </div>
    </div>
  );
}

function SliderSession({
  role, story, partnerValue, onEnd, onSpeakFreely,
}: {
  role: Role;
  story?: MockStory;
  partnerValue: number | null;
  onEnd: (myFinal: number | null, theirFinal: number | null) => void;
  onSpeakFreely: () => void;
}) {
  const [myValue, setMyValue] = useState<number>(0);
  const [sealed, setSealed] = useState<{ my: number; partner: number } | null>(null);
  const [freePhase, setFreePhase] = useState<FreePhase>('sealed-bid');
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const bothAtTen = myValue === 10 && (partnerValue ?? 0) === 10;

  // Simulate partner sealed bid after 2s
  useEffect(() => {
    if (freePhase === 'waiting') {
      const timer = setTimeout(() => {
        const partnerGuess = 3 + Math.floor(Math.random() * 5);
        setSealed(prev => prev ? { ...prev, partner: partnerGuess } : { my: myValue, partner: partnerGuess });
        setFreePhase('reveal');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [freePhase, myValue]);

  // Auto-transition: reveal → paraphrase after 1.5s
  useEffect(() => {
    if (freePhase === 'reveal') {
      const timer = setTimeout(() => setFreePhase('paraphrase'), 1500);
      return () => clearTimeout(timer);
    }
  }, [freePhase]);

  const handleSealedSubmit = () => {
    setSealed({ my: myValue, partner: 0 });
    setFreePhase('waiting');
  };

  const handleParaphraseDone = () => {
    // Record this as Round 1
    if (sealed) {
      const lv = role === 'listener' ? sealed.my : sealed.partner;
      const sv = role === 'speaker' ? sealed.my : sealed.partner;
      setRounds(prev => [...prev, { listenerConfidence: lv, speakerBelief: sv, label: `${prev.length}` }]);
    }
    setFreePhase('unlocked');
  };

  // Values for display
  const showSealed = sealed && (freePhase !== 'sealed-bid' && freePhase !== 'waiting');
  const liveListener = role === 'listener' ? myValue : (partnerValue ?? sealed?.partner ?? 0);
  const liveSpeaker = role === 'speaker' ? myValue : (partnerValue ?? sealed?.partner ?? 0);
  const gap = liveListener - liveSpeaker;
  const absGap = Math.abs(gap);

  return (
    <div className="flex flex-col min-h-[100vh] bg-white relative">
      <AppHeader onEnd={() => onEnd(myValue, partnerValue)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col justify-end px-4 pt-4">
        <div className="space-y-3 mb-4 max-w-sm mx-auto w-full">

          {/* Journey to understand */}
          {(showSealed || rounds.length > 0 || freePhase === 'unlocked') && (
            <div className="bg-muted/50 border border-border rounded-lg p-4 text-left">
              <p className="text-sm text-muted-foreground text-center mb-3">
                {role === 'speaker'
                  ? <>{PARTNER_NAME}&apos;s journey to <span className="font-semibold text-foreground">understand you</span></>
                  : <>Your journey to <span className="font-semibold text-foreground">understand {PARTNER_NAME}</span></>
                }
              </p>

              {/* Committed rounds — numbered 0, 1, 2... */}
              {rounds.map((round, i) => (
                <div key={i} className="space-y-1 mb-2 pb-2 border-b border-border/50 last:border-0 last:mb-0 last:pb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground w-4 text-right mr-2">{round.label}</span>
                    <span className="text-muted-foreground flex-1">{role === 'speaker' ? `${PARTNER_NAME}'s confidence` : 'Your confidence'}</span>
                    <DotBar value={round.listenerConfidence} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{round.listenerConfidence}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="w-4 mr-2" />
                    <span className="font-semibold text-foreground flex-1">{role === 'speaker' ? 'Your belief' : `${PARTNER_NAME}'s belief`}</span>
                    <DotBar value={round.speakerBelief} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{round.speakerBelief}</span>
                  </div>
                </div>
              ))}

              {/* Initial guesses (sealed bid) — shown after reveal, before rounds recorded */}
              {showSealed && rounds.length === 0 && (
                <div className="space-y-1 mb-2 pb-2 border-b border-border/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex-1">{role === 'speaker' ? `${PARTNER_NAME}'s confidence` : 'Your confidence'}</span>
                    <DotBar value={role === 'listener' ? sealed!.my : sealed!.partner} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{role === 'listener' ? sealed!.my : sealed!.partner}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground flex-1">{role === 'speaker' ? 'Your belief' : `${PARTNER_NAME}'s belief`}</span>
                    <DotBar value={role === 'speaker' ? sealed!.my : sealed!.partner} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{role === 'speaker' ? sealed!.my : sealed!.partner}</span>
                  </div>
                </div>
              )}

              {/* Live state (unlocked) — no header, just numbers updating */}
              {freePhase === 'unlocked' && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex-1">{role === 'speaker' ? `${PARTNER_NAME}'s confidence` : 'Your confidence'}</span>
                    <DotBar value={liveListener} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{liveListener}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground flex-1">{role === 'speaker' ? 'Your belief' : `${PARTNER_NAME}'s belief`}</span>
                    <DotBar value={liveSpeaker} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{liveSpeaker}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Story card */}
          {story && <StoryCard story={story} />}

          {/* Gap banner — only during reveal, before paraphrase */}
          {(freePhase === 'reveal' || freePhase === 'paraphrase') && (
            bothAtTen ? <MutualTenCelebration /> :
            absGap <= 1 ? (
              <div className="text-center py-2">
                <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">Well calibrated!</span>
              </div>
            ) : (
              <div className="text-center py-3">
                <span className="inline-block text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 mb-2">
                  {absGap} {absGap === 1 ? 'point' : 'points'} gap
                </span>
                <p className="text-sm font-medium text-foreground">
                  {gap > 0
                    ? `Help ${role === 'speaker' ? PARTNER_NAME : 'you'} understand ${role === 'speaker' ? 'you' : PARTNER_NAME} better.`
                    : `${absGap} ${absGap === 1 ? 'point' : 'points'} gap — underconfident`}
                </p>
              </div>
            )
          )}
        </div>

        {/* Drawer — changes based on phase */}
        <div className="bg-muted/30 border-t border-border rounded-t-2xl px-6 pt-5 pb-6 -mx-4 mt-auto shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">

          {/* Phase 1: Sealed bid */}
          {freePhase === 'sealed-bid' && (
            <>
              <h3 className="text-base font-medium text-center mb-5">
                {role === 'speaker'
                  ? <>How well do you believe <span className="font-semibold">{PARTNER_NAME}</span> understands your intention?</>
                  : <>How well do you believe you understand <span className="font-semibold">{PARTNER_NAME}</span>&apos;s intention?</>}
              </h3>
              <div className="flex justify-between mb-1 text-xs text-gray-500">
                <span>Not at all</span><span>Complete cognitive understanding</span>
              </div>
              <div className="px-2">
                <SliderTrack value={myValue} onChange={setMyValue} label="" />
              </div>
              <button onClick={handleSealedSubmit} className="w-full mt-5 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors">
                Submit
              </button>
              <button onClick={onSpeakFreely} className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-6 mx-auto block min-h-[44px]">
                Speak freely
              </button>
            </>
          )}

          {/* Phase 2: Waiting for partner */}
          {freePhase === 'waiting' && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Waiting for <span className="font-semibold">{PARTNER_NAME}</span> to submit...</p>
              <p className="text-xs text-muted-foreground mt-2">Your answer: {sealed?.my}/10</p>
            </div>
          )}

          {/* Phase 3: Reveal — auto-transitions to paraphrase */}
          {freePhase === 'reveal' && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">Initial guesses revealed ↑</p>
            </div>
          )}

          {/* Phase 4: Paraphrase — listener driven (in prototype: shows both views + auto-advance for speaker) */}
          {freePhase === 'paraphrase' && (
            <div className="text-center">
              {role === 'listener' ? (
                <>
                  <p className="text-base font-medium mb-4">
                    Paraphrase what you understood back to <span className="font-semibold">{PARTNER_NAME}</span>
                  </p>
                  <button onClick={handleParaphraseDone} className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors">
                    I paraphrased
                  </button>
                </>
              ) : (
                <>
                  <p className="text-base font-medium mb-4">
                    Waiting for <span className="font-semibold">{PARTNER_NAME}</span> to paraphrase...
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">Listen carefully to their explanation</p>
                  <button onClick={handleParaphraseDone} className="w-full py-3 bg-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-300 transition-colors">
                    (Prototype: simulate {PARTNER_NAME} paraphrased)
                  </button>
                </>
              )}
            </div>
          )}

          {/* Phase 5: Unlocked — continuous slider */}
          {freePhase === 'unlocked' && (
            <>
              <h3 className="text-base font-medium text-center mb-5">
                {role === 'speaker'
                  ? <>How well do you believe <span className="font-semibold">{PARTNER_NAME}</span> understands your intention?</>
                  : <>How well do you believe you understand <span className="font-semibold">{PARTNER_NAME}</span>&apos;s intention?</>}
              </h3>
              <div className="flex justify-between mb-1 text-xs text-gray-500">
                <span>Not at all</span><span>Complete cognitive understanding</span>
              </div>
              <div className="px-2">
                <SliderTrack value={myValue} onChange={setMyValue} label="" />
              </div>
              <button onClick={onSpeakFreely} className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-8 mx-auto block min-h-[44px]">
                Speak freely
              </button>
            </>
          )}
        </div>
      </div>

      {/* Both at 10 — complete option */}
      {freePhase === 'unlocked' && bothAtTen && (
        <div className="absolute bottom-32 left-0 right-0 flex justify-center animate-fade-in">
          <button onClick={() => onEnd(myValue, partnerValue)}
            className="px-6 py-2 bg-green-50 text-green-700 border border-green-200 rounded-full text-sm font-medium hover:bg-green-100 transition-colors">
            Complete ✓
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryStep({ myFinal, theirFinal, story, onDone, onRestart }: {
  myFinal: number | null; theirFinal: number | null; story?: MockStory;
  onDone: () => void; onRestart: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <div className="w-full max-w-xs">
        <h2 className="font-serif text-xl text-center mb-6">Session complete</h2>
        <div className="bg-gray-50 rounded-xl p-6 space-y-3 mb-8">
          {story && <div className="text-sm text-gray-500"><span className="text-gray-400">Story:</span> {story.title}</div>}
          <div className="text-sm text-gray-500"><span className="text-gray-400">With:</span> {PARTNER_NAME}</div>
          <div className="flex justify-between text-sm pt-2 border-t border-border">
            <span className="text-gray-400">Your final</span><span className="font-medium">{myFinal ?? '–'}/10</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">{PARTNER_NAME}&apos;s final</span><span className="font-medium">{theirFinal ?? '–'}/10</span>
          </div>
          {myFinal !== null && theirFinal !== null && (
            <div className="flex justify-between text-sm pt-2 border-t border-border">
              <span className="text-gray-400">Final gap</span>
              <span className={`font-medium ${Math.abs(myFinal - theirFinal) <= 1 ? 'text-green-600' : 'text-amber-600'}`}>
                {Math.abs(myFinal - theirFinal)}
              </span>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <button onClick={onRestart} className="w-full py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors">New session</button>
          <button onClick={onDone} className="w-full py-3 text-gray-500 hover:text-gray-700 text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Prototype ──────────────────────────────────────────

export function NewLivePrototype() {
  const [step, setStep] = useState<FlowStep>('join');
  const [mode, setMode] = useState<SessionMode>('sliders');
  const [role, setRole] = useState<Role>('speaker');
  const [story, setStory] = useState<MockStory | undefined>();
  const [finalScores, setFinalScores] = useState<{ my: number | null; their: number | null }>({ my: null, their: null });

  const isSessionActive = step === 'session';
  const partnerValue = (function usePartnerSim() {
    const [value, setValue] = useState<number | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval>>();
    useEffect(() => {
      if (!isSessionActive) return;
      const startTimeout = setTimeout(() => {
        setValue(4);
        intervalRef.current = setInterval(() => {
          setValue(prev => {
            if (prev === null) return 4;
            const delta = Math.random() > 0.3 ? 1 : -1;
            return Math.max(0, Math.min(10, prev + delta));
          });
        }, 3000 + Math.random() * 4000);
      }, 5000);
      return () => { clearTimeout(startTimeout); if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);
    return value;
  })();

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen">
      {step === 'join' && <JoinStep onJoin={() => setStep('role-claim')} />}
      {step === 'role-claim' && (
        <RoleClaimStep mode={mode} onModeChange={setMode}
          onRoleClaim={(r, s) => { setRole(r); setStory(s); setStep('session'); }} />
      )}
      {step === 'session' && (
        <SliderSession role={role} story={story} partnerValue={partnerValue}
          onEnd={(my, their) => { setFinalScores({ my, their }); setStep('summary'); }}
          onSpeakFreely={() => setStep('role-claim')} />
      )}
      {step === 'summary' && (
        <SummaryStep myFinal={finalScores.my} theirFinal={finalScores.their} story={story}
          onDone={() => { setStep('join'); setStory(undefined); }}
          onRestart={() => { setStep('join'); setStory(undefined); }} />
      )}
    </div>
  );
}
