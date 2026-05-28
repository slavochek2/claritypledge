/**
 * @file letter-redesign-preview-page.tsx
 * @description P852 Phase 1 — DEV-ONLY visual preview harness for the letter flow redesign.
 *
 * Self-contained walkthrough: pure presentational components + local useState navigation.
 * NO real data, NO Supabase, NO auth, NO useLetterReadingState.
 *
 * Route: /_preview/letter-redesign
 *
 * Screen sequence (anti-point-lead chapter variant, default):
 *   0: cover
 *   1: point-engage (Chapter 1)
 *   2: point-revealed (Chapter 1)
 *   3: story-rate (Chapter 1)
 *   4: story-revealed (Chapter 1)
 *   5: remaining-point-engage (Chapter 1)
 *   6: remaining-point-revealed (Chapter 1)
 *   7: point-engage (Chapter 2)
 *   8: point-revealed (Chapter 2)
 *   9: story-rate (Chapter 2)
 *  10: story-revealed (Chapter 2)
 *  11: completion
 *
 * Story-first chapter variant (select via URL query param `?variant=story-first`):
 *   0: cover
 *   1: story-rate (Chapter 1, no leading anti-point)
 *   2: story-revealed
 *   3: remaining-point-engage
 *   4: remaining-point-revealed
 *   5: completion
 *
 * Navigation — NO visible chrome (round-5):
 * - Forward: the on-screen CTAs advance.
 * - Keyboard: ArrowRight = next screen, ArrowLeft = previous (invisible keydown listener).
 * - Variant: default = anti-point-lead; `?variant=story-first` selects the story-first build.
 *
 * Stand-ins used:
 * - LetterCover: replaced by faithful inline stand-in — LetterCover requires router context
 *   and auth props that are irrelevant here; the inline version uses the exact same tokens.
 * - LetterCompletionSummary: replaced by inline stand-in — it calls useNavigate + triggerConfetti
 *   + Mixpanel analytics. The stand-in renders the recap directly.
 * - ComprehensionRatingCard: used directly with onSelect (no submission side-effects in mock).
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, ArrowRight, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LetterPointCard } from '@/app/components/letters/letter-point-card';
import { LetterRevealCard } from '@/app/components/letters/letter-reveal-card';
import { LetterRevealOrdinal } from '@/app/components/letters/letter-reveal-ordinal';
import { LetterRevealNumeric } from '@/app/components/letters/letter-reveal-numeric';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared/PositionButton';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import type { PositionType } from '@/app/types';

// ============================================================================
// MOCK DATA
// ============================================================================

const READER_NAME = 'Alex';
const AUTHOR_NAME = 'Maya';
const AUTHOR_AVATAR_COLOR = '#0D9488';
const READER_AVATAR_COLOR = '#0044CC';

// P3: All-zero counts for pre-commit engage screens. PositionButtons only renders a
// count badge when count > 0, so passing zeros hides the community distribution and
// prevents priming the reader's genuine 'before' position (P852 measurement integrity).
const ZERO_COUNTS: SevenPointCounts = {
  strongly_agree: 0,
  agree: 0,
  somewhat_agree: 0,
  unsure: 0,
  somewhat_disagree: 0,
  disagree: 0,
  strongly_disagree: 0,
};

const CHAPTER_1 = {
  chapter: 1,
  antiPoint: {
    statement:
      'Telling someone they are wrong without first checking your understanding of their position is a form of intellectual disrespect — even when your critique is technically correct.',
  },
  remainingPoint: {
    statement:
      'The quality of a disagreement is measured not by how certain each side feels, but by how accurately each side can represent the other\'s actual reasoning.',
  },
  story: {
    text: `Last year I was deep in a product debate with a co-founder I'll call Dara. I was convinced our onboarding was the bottleneck — every data point I had said so. I walked into the call ready to argue, fired off my thesis in two minutes flat, and then braced for pushback.

Dara was quiet for a moment, then said something unexpected: "I don't think I disagree with you. But I'm not sure you understand what I actually believe about it." That stopped me cold.

She was right. I had been arguing against a version of her position I'd constructed in my own head — tidy, easy to defeat. The real position was messier and, honestly, more interesting. It took us forty minutes to even find out we were looking at different parts of the same problem.

That conversation taught me more about what was blocking our growth than any dashboard had. And I never would have got there if she hadn't called out the gap before I could steamroll past it.`,
    selfRating: 7,
    authorPrediction: 4,
  },
};

const CHAPTER_2 = {
  chapter: 2,
  antiPoint: {
    statement:
      'Speed of decision-making in a founding team is less important than the accuracy of mutual understanding — a fast wrong decision compounds faster than a slow right one.',
  },
  story: {
    text: `Six months into building, my co-founder and I had developed a shorthand so efficient it felt like telepathy. We could ship decisions in minutes. Then we hired our first engineer and watched that efficiency collapse completely.

What I hadn't noticed was that our "shorthand" was actually a shared fiction — a set of labels that meant subtly different things to each of us. When a third person joined and used those same words with their own meaning, the whole structure became visible. We spent three days disentangling what "ready to ship" meant to each of us. Three days to define two words.

The telepathy wasn't real understanding. It was two people who'd stopped checking.`,
    selfRating: 8,
    authorPrediction: 5,
  },
};

// ============================================================================
// SCREEN DEFINITIONS
// ============================================================================

type VariantType = 'anti-point-lead' | 'story-first';

interface ScreenDef {
  id: string;
  chapter: number;
  totalChapters: number;
  /** Position of this screen within its chapter (0-indexed numerator) */
  withinChapter: number;
  /** Total screens in this chapter */
  chapterScreens: number;
  phase:
    | 'cover'
    | 'point-engage'
    | 'point-revealed'
    | 'story-rate'
    | 'story-revealed'
    | 'remaining-point-engage'
    | 'remaining-point-revealed'
    | 'completion';
  chapterIndex: number;
  advanceCta: string;
}

function buildAntiPointLeadScreens(): ScreenDef[] {
  const totalChapters = 2;
  return [
    // Cover
    {
      id: 'cover',
      chapter: 0,
      totalChapters,
      withinChapter: 0,
      chapterScreens: 1,
      phase: 'cover',
      chapterIndex: -1,
      advanceCta: 'Open the Letter',
    },
    // Chapter 1
    {
      id: 'ch1-point-engage',
      chapter: 1,
      totalChapters,
      withinChapter: 0,
      chapterScreens: 6,
      phase: 'point-engage',
      chapterIndex: 0,
      advanceCta: 'Lock in your position',
    },
    {
      id: 'ch1-point-revealed',
      chapter: 1,
      totalChapters,
      withinChapter: 1,
      chapterScreens: 6,
      phase: 'point-revealed',
      chapterIndex: 0,
      advanceCta: `Read ${AUTHOR_NAME}'s story`,
    },
    {
      id: 'ch1-story-rate',
      chapter: 1,
      totalChapters,
      withinChapter: 2,
      chapterScreens: 6,
      phase: 'story-rate',
      chapterIndex: 0,
      advanceCta: 'Continue',
    },
    {
      id: 'ch1-story-revealed',
      chapter: 1,
      totalChapters,
      withinChapter: 3,
      chapterScreens: 6,
      phase: 'story-revealed',
      chapterIndex: 0,
      advanceCta: 'Next point',
    },
    {
      id: 'ch1-remaining-engage',
      chapter: 1,
      totalChapters,
      withinChapter: 4,
      chapterScreens: 6,
      phase: 'remaining-point-engage',
      chapterIndex: 0,
      advanceCta: 'Lock in your position',
    },
    {
      id: 'ch1-remaining-revealed',
      chapter: 1,
      totalChapters,
      withinChapter: 5,
      chapterScreens: 6,
      phase: 'remaining-point-revealed',
      chapterIndex: 0,
      advanceCta: 'Next chapter',
    },
    // Chapter 2
    {
      id: 'ch2-point-engage',
      chapter: 2,
      totalChapters,
      withinChapter: 0,
      chapterScreens: 4,
      phase: 'point-engage',
      chapterIndex: 1,
      advanceCta: 'Lock in your position',
    },
    {
      id: 'ch2-point-revealed',
      chapter: 2,
      totalChapters,
      withinChapter: 1,
      chapterScreens: 4,
      phase: 'point-revealed',
      chapterIndex: 1,
      advanceCta: `Read ${AUTHOR_NAME}'s story`,
    },
    {
      id: 'ch2-story-rate',
      chapter: 2,
      totalChapters,
      withinChapter: 2,
      chapterScreens: 4,
      phase: 'story-rate',
      chapterIndex: 1,
      advanceCta: 'Continue',
    },
    {
      id: 'ch2-story-revealed',
      chapter: 2,
      totalChapters,
      withinChapter: 3,
      chapterScreens: 4,
      phase: 'story-revealed',
      chapterIndex: 1,
      advanceCta: 'Complete Letter',
    },
    // Completion
    {
      id: 'completion',
      chapter: 0,
      totalChapters,
      withinChapter: 0,
      chapterScreens: 1,
      phase: 'completion',
      chapterIndex: -1,
      advanceCta: 'See Your Letter Summary',
    },
  ];
}

function buildStoryFirstScreens(): ScreenDef[] {
  const totalChapters = 1;
  return [
    {
      id: 'cover',
      chapter: 0,
      totalChapters,
      withinChapter: 0,
      chapterScreens: 1,
      phase: 'cover',
      chapterIndex: -1,
      advanceCta: 'Open the Letter',
    },
    {
      id: 'ch1-story-rate',
      chapter: 1,
      totalChapters,
      withinChapter: 0,
      chapterScreens: 4,
      phase: 'story-rate',
      chapterIndex: 0,
      advanceCta: 'Continue',
    },
    {
      id: 'ch1-story-revealed',
      chapter: 1,
      totalChapters,
      withinChapter: 1,
      chapterScreens: 4,
      phase: 'story-revealed',
      chapterIndex: 0,
      advanceCta: 'Next point',
    },
    {
      id: 'ch1-remaining-engage',
      chapter: 1,
      totalChapters,
      withinChapter: 2,
      chapterScreens: 4,
      phase: 'remaining-point-engage',
      chapterIndex: 0,
      advanceCta: 'Lock in your position',
    },
    {
      id: 'ch1-remaining-revealed',
      chapter: 1,
      totalChapters,
      withinChapter: 3,
      chapterScreens: 4,
      phase: 'remaining-point-revealed',
      chapterIndex: 0,
      advanceCta: 'Complete Letter',
    },
    {
      id: 'completion',
      chapter: 0,
      totalChapters,
      withinChapter: 0,
      chapterScreens: 1,
      phase: 'completion',
      chapterIndex: -1,
      advanceCta: 'See Your Letter Summary',
    },
  ];
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Segmented chapter progress bar — top-left persistent indicator (#4).
 * One segment per chapter (teaches what a chapter is, matching the production bar):
 * - Completed chapters: fully filled (brand blue)
 * - Current chapter: filled to within-chapter progress
 * - Future chapters: empty (gray-200)
 * Keeps the "Chapter X of N" text label alongside.
 */
function ChapterProgressBar({
  chapter,
  totalChapters,
  withinChapter,
  chapterScreens,
}: {
  chapter: number;
  totalChapters: number;
  withinChapter: number;
  chapterScreens: number;
}) {
  if (chapter === 0) return null; // cover / completion screens have no chapter indicator
  // within-chapter fill for the CURRENT chapter's segment (0–100%)
  const currentFillPct =
    chapterScreens > 1 ? Math.round((withinChapter / (chapterScreens - 1)) * 100) : 100;

  return (
    <div className="fixed top-0 left-0 z-50 px-4 pt-3 pb-2.5 bg-background/95 backdrop-blur-sm border-b border-gray-100 w-full">
      {/* 3-zone row: left = chapter label, center = segments (visually centered),
          right = empty spacer that mirrors the label width so the segments stay centered. */}
      <div className="flex items-center gap-3 max-w-lg mx-auto">
        <span className="flex-1 text-sm text-[#1A1A1A]/50 whitespace-nowrap">
          Chapter {chapter} of {totalChapters}
        </span>
        {/* One segment per chapter — centered in the header, capped width */}
        <div className="flex gap-1.5 w-full max-w-xs mx-auto">
          {Array.from({ length: totalChapters }, (_, i) => {
            const segIndex = i + 1; // chapters are 1-indexed
            const isCompleted = segIndex < chapter;
            const isCurrent = segIndex === chapter;
            const fill = isCompleted ? 100 : isCurrent ? currentFillPct : 0;
            return (
              <div
                key={segIndex}
                className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"
                role="presentation"
              >
                <div
                  className="h-full bg-[#0044CC] rounded-full transition-[width] duration-300"
                  style={{ width: `${fill}%` }}
                />
              </div>
            );
          })}
        </div>
        {/* Right spacer — balances the left label so the centered segments are truly centered. */}
        <span className="flex-1" aria-hidden="true" />
      </div>
    </div>
  );
}

/**
 * PrimaryCta — the unmistakable main action (#1).
 * Full-width within its container, solid brand-blue pill, bold, large text,
 * generous padding (~56px tall), with an optional icon inside.
 * Disabled state is visibly lighter (opacity-50).
 */
function PrimaryCta({
  label,
  onClick,
  disabled = false,
  icon,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: 'mail' | 'arrow' | 'lock';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onClick()}
      disabled={disabled}
      className={cn(
        'w-full inline-flex items-center justify-center gap-2.5',
        'rounded-full bg-[#0044CC] text-white font-bold text-lg',
        'px-8 py-4 min-h-[56px] shadow-sm transition-colors',
        'hover:bg-[#0033AA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0044CC] focus-visible:ring-offset-2',
        disabled && 'opacity-50 cursor-not-allowed hover:bg-[#0044CC]',
        className
      )}
    >
      <span>{label}</span>
      {icon === 'mail' && <Mail className="w-5 h-5" aria-hidden="true" />}
      {icon === 'arrow' && <ArrowRight className="w-5 h-5" aria-hidden="true" />}
      {icon === 'lock' && <Lock className="w-5 h-5" aria-hidden="true" />}
    </button>
  );
}

/** Stand-in cover screen — faithful to LetterCover tokens without router/auth deps. */
function MockCoverScreen({ onAdvance }: { onAdvance: () => void }) {
  return (
    // Stand-in: replaces LetterCover which requires router context + auth props.
    // Uses identical brand tokens: font-serif, #0044CC, #1A1A1A/50, Playfair.
    // #2/#3: generous vertical breathing room + editorial title to match the SD cover.
    <div className="flex flex-col items-center justify-center min-h-[78vh] text-center space-y-10 py-16 px-6">
      <div className="w-16 h-16 rounded-full bg-[#0044CC]/10 flex items-center justify-center">
        <Mail className="w-7 h-7 text-[#0044CC]" aria-hidden="true" />
      </div>

      <div className="space-y-3">
        {/* #3: minimal eyebrow */}
        <p className="text-xs uppercase tracking-widest text-[#1A1A1A]/40 font-medium">
          A Clarity Letter
        </p>
        {/* #3: BIG editorial serif title */}
        <h1
          className="text-4xl sm:text-5xl font-serif text-[#1A1A1A] leading-tight"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          For {READER_NAME}
        </h1>
        {/* #3/P4: participant row with author avatar; name smaller + italic (SD shows italic "From"). */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <GravatarAvatar
            name={AUTHOR_NAME}
            photoUrl={undefined}
            avatarColor={AUTHOR_AVATAR_COLOR}
            isPledger={true}
            size="sm"
          />
          <span className="text-sm italic text-[#1A1A1A]/60">From {AUTHOR_NAME}</span>
        </div>
      </div>

      <p className="text-sm text-[#1A1A1A]/50">
        2 chapters &middot; 3 points &middot; ~6 minutes
      </p>

      {/* #1: primary CTA — full-width pill, bold, envelope icon inside */}
      <div className="w-full max-w-sm">
        <PrimaryCta label="Open the Letter" onClick={onAdvance} icon="mail" />
      </div>

      <p className="text-xs text-[#1A1A1A]/40 max-w-xs leading-relaxed">
        {AUTHOR_NAME} has shared a perspective they believe you deserve to hear.
      </p>
    </div>
  );
}

/** Stand-in completion screen — faithful to LetterCompletionSummary without analytics/confetti. */
function MockCompletionScreen() {
  // Stand-in: replaces LetterCompletionSummary which calls useNavigate + triggerConfetti + analytics.
  // Founder decision (P852 preview): the inline per-chapter recap was cut — it read as a
  // summary and overlapped the "See Your Letter Summary" CTA. The full recap lives on the
  // results page that the CTA leads to.
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8 py-12 px-6">
      <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
        <span className="text-4xl">✦</span>
      </div>

      <h1
        className="text-3xl font-serif text-[#1A1A1A] text-center"
        style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
      >
        A Moment of Intellectual Integrity
      </h1>

      <p className="text-sm text-[#1A1A1A]/60 max-w-sm leading-relaxed">
        Being clear where you stand, and honest about how much you believe you understand.
      </p>

      {/* #1: primary CTA — full-width pill, bold, trailing arrow */}
      <div className="w-full max-w-sm">
        <PrimaryCta label="See Your Letter Summary" onClick={() => {}} icon="arrow" />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PREVIEW PAGE
// ============================================================================

export function LetterRedesignPreviewPage() {
  // Variant via URL query param: `?variant=story-first` → story-first build; default = anti-point-lead.
  const [searchParams] = useSearchParams();
  const variant: VariantType =
    searchParams.get('variant') === 'story-first' ? 'story-first' : 'anti-point-lead';
  const screens =
    variant === 'anti-point-lead' ? buildAntiPointLeadScreens() : buildStoryFirstScreens();

  const [screenIndex, setScreenIndex] = useState(0);
  // Per-screen user position selections (keyed by screen id)
  const [positions, setPositions] = useState<Record<string, PositionType | null>>({});
  // Per-screen comprehension ratings (keyed by screen id)
  const [ratings, setRatings] = useState<Record<string, number>>({});

  const screen = screens[Math.min(screenIndex, screens.length - 1)];

  const advance = () => {
    if (screenIndex < screens.length - 1) {
      setScreenIndex((i) => i + 1);
    }
  };

  // Invisible keyboard nav: ArrowRight = next, ArrowLeft = previous. No visible chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setScreenIndex((i) => Math.min(screens.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setScreenIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screens.length]);

  // Reset to the cover whenever the variant changes (URL param switch).
  useEffect(() => {
    setScreenIndex(0);
    setPositions({});
    setRatings({});
  }, [variant]);

  // Determine which chapter data to use based on screen's chapterIndex
  const chapterData = screen.chapterIndex === 0 ? CHAPTER_1 : CHAPTER_2;

  // Current user position for this screen
  const currentPosition: PositionType | null = positions[screen.id] ?? null;
  const currentRating: number | null = ratings[screen.id] ?? null;

  // CTA disabled state — position/rating-gated screens
  const needsPosition =
    screen.phase === 'point-engage' || screen.phase === 'remaining-point-engage';
  const needsRating = screen.phase === 'story-rate';
  const ctaDisabled =
    (needsPosition && currentPosition === null) ||
    (needsRating && currentRating === null);

  // Whether we're on the completion screen
  const isCompletion = screen.phase === 'completion';
  const isCover = screen.phase === 'cover';

  return (
    <div className="min-h-screen bg-background relative">
      {/* No visible nav chrome (round-5): forward via CTAs, ArrowLeft/ArrowRight to step,
          and ?variant=story-first to switch builds. */}

      {/* Chapter progress bar — fixed top-left, persistent (grouping-legibility fix #4) */}
      <ChapterProgressBar
        chapter={screen.chapter}
        totalChapters={screen.totalChapters}
        withinChapter={screen.withinChapter}
        chapterScreens={screen.chapterScreens}
      />

      {/* Main scrollable content.
          pb-44 (176px) clears the fixed bottom bar: FixedBottomBar is p-4 (32px) +
          a py-6/min-h-[48px] button (~64px) + safe-area-inset ≈ 100-110px. pb-44 leaves
          a comfortable margin so the story-rate 0–10 scale + Continue button are never
          occluded by the fixed CTA, including at 390px and 320px. */}
      <div
        className={cn(
          'flex flex-col items-center justify-start px-4 pb-44 max-w-lg mx-auto w-full',
          // Top padding: extra when chapter bar is showing
          screen.chapter > 0 ? 'pt-16' : 'pt-6'
        )}
      >
        {/* ================================================================
            COVER
            ================================================================ */}
        {isCover && (
          <MockCoverScreen onAdvance={advance} />
        )}

        {/* ================================================================
            ANTI-POINT / REMAINING-POINT ENGAGE
            ================================================================ */}
        {(screen.phase === 'point-engage' || screen.phase === 'remaining-point-engage') && (
          // P2a: vertically center between top progress bar and fixed CTA so the
          // statement + position buttons sit in the optical center, not pinned to top.
          <div className="w-full min-h-[calc(100vh-13rem)] flex flex-col justify-center gap-8 py-12 sm:py-16">
            <LetterPointCard
              statement={
                screen.phase === 'point-engage'
                  ? (chapterData.antiPoint?.statement ?? chapterData.antiPoint?.statement ?? '')
                  : (chapterData.remainingPoint
                    ? chapterData.remainingPoint.statement
                    : chapterData.antiPoint?.statement ?? '')
              }
              framingQuestion="To what extent do you agree?"
            >
              {/* P3: Pre-commit — counts hidden to avoid priming the genuine 'before' position
                  (P852 measurement integrity). Integration phase must enforce this against real data.
                  PositionButtons only renders a count badge when count > 0, so all-zero counts
                  produce a clean, distribution-free selector. */}
              <PositionButtons
                userPosition={currentPosition}
                counts={ZERO_COUNTS}
                onPositionClick={(p) => setPositions((prev) => ({ ...prev, [screen.id]: p }))}
                // onClear enables the standard remove/change affordance (the in-menu
                // "Clear position" row) — without it the reader can't unset or adjust.
                onClear={() => setPositions((prev) => ({ ...prev, [screen.id]: null }))}
                // #1: bigger, full-width, centered buttons for the engage screen.
                size="lg"
              />
              {/* R8: discoverability hint for the intensity menu (tap selected group again
                  to fine-tune Somewhat/Strongly/Clear). Letter-local — does NOT touch the
                  shared PositionButtons (/live stays unchanged). Shows only post-selection.
                  R9: ALWAYS rendered so it permanently reserves its line height — only
                  opacity toggles, preventing the vertically-centered engage block from
                  reflowing ("jumping up") when the hint appears. */}
              <p
                aria-hidden={currentPosition === null}
                className={cn(
                  'text-xs text-[#1A1A1A]/45 text-center mt-3 transition-opacity duration-200',
                  currentPosition !== null ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
              >
                Tap your choice again to fine-tune how strongly.
              </p>
            </LetterPointCard>
          </div>
        )}

        {/* ================================================================
            ANTI-POINT / REMAINING-POINT REVEALED (ordinal)
            ================================================================ */}
        {(screen.phase === 'point-revealed' || screen.phase === 'remaining-point-revealed') && (
          // P2a: vertically center so the reveal card reads as the full-screen centerpiece.
          <div className="w-full min-h-[calc(100vh-13rem)] flex flex-col justify-center gap-8 py-12 sm:py-16">
            <LetterRevealCard>
              {/* Ordinal reveal owns its header ("Where you each stand", no ear) + attribution.
                  Positions are the hero, statement renders below in the shared statement card. */}
              <LetterRevealOrdinal
                statement={
                  screen.phase === 'point-revealed'
                    ? (chapterData.antiPoint?.statement ?? '')
                    : (chapterData.remainingPoint
                      ? chapterData.remainingPoint.statement
                      : chapterData.antiPoint?.statement ?? '')
                }
                readerPosition={
                  // Use last-selected position for this chapter's engage screen, or fallback
                  (screen.phase === 'point-revealed'
                    ? positions[screen.id.replace('revealed', 'engage')] ??
                      positions[screen.id.replace('point-revealed', 'point-engage')]
                    : positions[screen.id.replace('remaining-revealed', 'remaining-engage')] ??
                      positions[screen.id.replace('remaining-point-revealed', 'remaining-point-engage')]) ??
                  'somewhat_agree'
                }
                authorPosition="agree"
                readerAvatarColor={READER_AVATAR_COLOR}
                readerHasPledged={false}
                authorName={AUTHOR_NAME}
                authorAvatarColor={AUTHOR_AVATAR_COLOR}
                authorHasPledged={false}
              />
            </LetterRevealCard>
          </div>
        )}

        {/* ================================================================
            STORY RATE
            ================================================================ */}
        {screen.phase === 'story-rate' && (
          // #6: mobile-comfortable spacing — tighter on narrow, roomier on sm+.
          <div className="w-full space-y-6 mt-6">
            {/* Story text — stand-in for LiveStoryCardExpanded (which pulls live session deps) */}
            {/* Stand-in: LiveStoryCardExpanded needs StoryWithPoints type + session context.
                Using a faithful token-consistent card here instead. */}
            <div className="w-full bg-white rounded-xl border border-gray-200 border-l-4 border-l-blue-500 p-4 sm:p-5 space-y-3">
              <p className="text-xs uppercase tracking-widest text-[#1A1A1A]/40">
                {AUTHOR_NAME}'s story
              </p>
              <p className="text-[15px] text-[#1A1A1A]/80 leading-relaxed whitespace-pre-line">
                {chapterData.story.text}
              </p>
            </div>

            {/* Comprehension rating — question made prominent per Visual Spec.
                The card's own submit button IS the advance CTA on this screen (faithful to
                the real component), so the page-level FixedBottomBar is suppressed for
                story-rate below to avoid a duplicate "Continue". */}
            <ComprehensionRatingCard
              question={`How well do you believe you understand ${AUTHOR_NAME}'s intention?`}
              onSelect={(r) => {
                setRatings((prev) => ({ ...prev, [screen.id]: r }));
                advance();
              }}
              submitLabel="Continue"
            />
          </div>
        )}

        {/* ================================================================
            STORY REVEALED (numeric)
            ================================================================ */}
        {screen.phase === 'story-revealed' && (
          // P2a: vertically center so the numeric reveal dominates the screen.
          <div className="w-full min-h-[calc(100vh-13rem)] flex flex-col justify-center gap-8 py-12 sm:py-16">
            <LetterRevealCard>
              {/* Numeric reveal owns the "Listening calibration" header + ear marker. */}
              <LetterRevealNumeric
                readerRating={currentRating ?? chapterData.story.selfRating}
                authorRating={chapterData.story.authorPrediction}
                gap={Math.abs(
                  (currentRating ?? chapterData.story.selfRating) - chapterData.story.authorPrediction
                )}
                readerName={READER_NAME}
                readerAvatarColor={READER_AVATAR_COLOR}
                readerHasPledged={false}
                authorName={AUTHOR_NAME}
                authorAvatarColor={AUTHOR_AVATAR_COLOR}
                authorHasPledged={false}
              />
            </LetterRevealCard>
          </div>
        )}

        {/* ================================================================
            COMPLETION
            ================================================================ */}
        {isCompletion && <MockCompletionScreen />}
      </div>

      {/* ================================================================
          FIXED BOTTOM BAR — advance CTA. Not shown on cover or completion
          (inline CTAs), nor on story-rate (the rating card's own submit advances).
          ================================================================ */}
      {!isCover && !isCompletion && !needsRating && (
        // #3: clear bottom breathing room so the CTA isn't glued to the viewport edge.
        // pb adds safe-area-inset PLUS a fixed gap; the base bar's pb-[env(...)] is overridden.
        <FixedBottomBar className="pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {/* #1: primary CTA — full-width pill, bold, large. Advance CTAs get a trailing
              arrow; "Lock in your position" is a commit action and gets a lock icon (SD mockup). */}
          <div className="w-full max-w-sm">
            <PrimaryCta
              label={screen.advanceCta}
              onClick={advance}
              disabled={ctaDisabled}
              icon={screen.advanceCta.startsWith('Lock in') ? 'lock' : 'arrow'}
            />
          </div>
        </FixedBottomBar>
      )}
    </div>
  );
}
