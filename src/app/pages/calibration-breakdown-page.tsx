/**
 * P967: Listening Calibration Breakdown Page
 *
 * Route: /me/calibration — self-only focus page.
 * Shows per-verification-row diffs that produced the profile calibration bar.
 *
 * Three states:
 *   empty      (0 eligible rows)
 *   pre-unlock (<5 eligible rows) — rows shown, verdict hidden
 *   unlocked   (≥5 eligible rows) — full table + footer + meaning + CTAs
 */

import { useNavigate, Link } from 'react-router-dom';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/auth';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import {
  useListenerCalibrationDiffs,
  computeDiff,
  computeFooter,
  isEligible,
  type CalibrationDiffRow,
} from '@/app/data/use-listener-calibration-diffs';

const UNLOCK_THRESHOLD = 5;

// ─── Info Tooltip (reuses CalibrationTooltip pattern from calibration-display.tsx) ──

function InfoTooltip({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const [clickLocked, setClickLocked] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleActivate = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
    setClickLocked(true);
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
      setClickLocked(false);
    }, 3000);
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (clickLocked && !newOpen) return;
    setOpen(newOpen);
  }, [clickLocked]);

  return (
    <Tooltip open={open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <button
          className="ml-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          aria-label="More information"
          onClick={(e) => { e.preventDefault(); handleActivate(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); } }}
        >
          <span className="text-xs font-medium border border-muted-foreground rounded-full px-1">i</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        <p className="text-xs">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Column headers ───────────────────────────────────────────────────────────

const COL1_FULL = 'you believed you understood their intended meaning';
const COL2_FULL = 'they believe you understood them after you explained back';
const COL1_NARROW = 'you believed';
const COL2_NARROW = 'they believe';
const COL1_TOOLTIP = 'Your own rating, before feedback: how well you thought you understood what your partner actually meant.';
const COL2_TOOLTIP = "Your partner's rating, after you explained their point back to them: how well they felt you actually understood.";

// ─── Footer row ───────────────────────────────────────────────────────────────

function FooterRow({ rows }: { rows: CalibrationDiffRow[] }) {
  const footer = computeFooter(rows);
  if (!footer) return null;

  const avgStr = Number.isInteger(footer.avg)
    ? String(footer.avg)
    : footer.avg.toFixed(1);

  return (
    <tfoot>
      <tr className="border-t-2 border-border bg-muted/40">
        <td className="py-2.5 pr-2 px-3 text-sm font-medium text-foreground">average</td>
        <td className="py-2.5 px-2" />
        <td className="py-2.5 px-2" />
        <td className="py-2.5 pl-2 pr-3 text-center tabular-nums text-base font-semibold text-foreground">
          {avgStr}
        </td>
      </tr>
    </tfoot>
  );
}

// ─── Verdict bar (thin wrapper reusing existing labels) ────────────────────

function VerdictBar({ avg }: { avg: number }) {
  function getLabel(gap: number): string {
    if (gap >= 5) return 'Very overconfident';
    if (gap >= 3) return 'Overconfident';
    if (gap >= 1) return 'Somewhat overconfident';
    if (gap > -1) return 'Well calibrated';
    if (gap > -3) return 'Somewhat underconfident';
    if (gap > -5) return 'Underconfident';
    return 'Very underconfident';
  }

  function getMeaning(gap: number): string {
    if (gap >= 1) return 'You rated your understanding higher than your partners did.';
    if (gap <= -1) return 'You rated your understanding lower than your partners did.';
    return 'Your ratings match your partners\' closely.';
  }

  const clamped = Math.max(-7, Math.min(7, avg));
  const pos = ((7 + clamped) / 14) * 100;
  const label = getLabel(avg);

  return (
    <div className="space-y-2">
      <div className="relative h-6 w-full">
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2.5 rounded-full bg-muted border border-border" />
        <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-muted-foreground -translate-x-px rounded-full" />
        <span
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-sm -translate-x-1/2"
          style={{ left: `${pos}%` }}
        />
      </div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-sm text-muted-foreground">{getMeaning(avg)}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CalibrationBreakdownPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, sessionChecked } = useAuth();
  const { rows, state, footer, isLoading } = useListenerCalibrationDiffs();

  useEffect(() => {
    if (!sessionChecked || authLoading) return;
    if (!user) navigate('/login?redirect=/me/calibration', { replace: true });
  }, [user, authLoading, sessionChecked, navigate]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/me');
    }
  }, [navigate]);

  // Narrow screen: ≤320px — abbreviate column headers
  // Use a simple media approach via class (Tailwind xs breakpoint)
  // We detect via CSS: hide/show via responsive classes
  const eligibleRows = rows.filter(isEligible);
  const eligibleCount = eligibleRows.length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-2xl px-4 pt-6">
          <FocusHeader onBack={handleBack} />
        </div>
        <ClarityPageLoader />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-2xl px-4 pt-6 pb-12">
          <FocusHeader onBack={handleBack} label="Back to profile" aria-label="Back to profile" />

          <h1 className="text-xl font-semibold text-foreground mb-6">Listening calibration</h1>

          {/* ── EMPTY STATE ── */}
          {state === 'empty' && (
            <div className="text-center space-y-4 py-12">
              <p className="text-muted-foreground">
                Finish your first listening session to start seeing your calibration diffs.
              </p>
              <Link
                to="/live"
                className="inline-flex items-center justify-center px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Start a session
              </Link>
            </div>
          )}

          {/* ── PRE-UNLOCK / UNLOCKED ── */}
          {(state === 'pre-unlock' || state === 'unlocked') && (
            <div className="space-y-8">

              {/* Section 1: Verdict bar (unlocked only) */}
              {state === 'unlocked' && footer && (
                <section aria-label="Your calibration score">
                  <VerdictBar avg={footer.avg} />
                </section>
              )}

              {/* Pre-unlock progress note */}
              {state === 'pre-unlock' && (
                <p className="text-sm text-muted-foreground">
                  {eligibleCount} of {UNLOCK_THRESHOLD} — your score unlocks after {UNLOCK_THRESHOLD - eligibleCount} more
                </p>
              )}

              {/* Section 2: Diffs table */}
              <section aria-label="Your calibration diffs">
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    {/* Wide headers (≥640px) */}
                    <thead className="hidden sm:table-header-group">
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="pb-2 pr-2 px-3 pt-3 font-normal" />
                        <th className="pb-2 px-2 pt-3 font-normal text-center">{COL1_FULL}</th>
                        <th className="pb-2 px-2 pt-3 font-normal text-center">{COL2_FULL}</th>
                        <th className="pb-2 pl-2 pr-3 pt-3 font-normal text-center" scope="col">gap</th>
                      </tr>
                    </thead>
                    {/* Narrow headers (<640px) */}
                    <thead className="sm:hidden">
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="pb-2 pr-2 px-3 pt-3 font-normal" />
                        <th className="pb-2 px-2 pt-3 font-normal text-center">
                          <span className="inline-flex items-center gap-0.5">
                            {COL1_NARROW}<InfoTooltip content={COL1_TOOLTIP} />
                          </span>
                        </th>
                        <th className="pb-2 px-2 pt-3 font-normal text-center">
                          <span className="inline-flex items-center gap-0.5">
                            {COL2_NARROW}<InfoTooltip content={COL2_TOOLTIP} />
                          </span>
                        </th>
                        <th className="pb-2 pl-2 pr-3 pt-3 font-normal text-center" scope="col">gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-b border-border/50 last:border-0 text-sm">
                          <td className="py-2 pr-2 px-3">
                            <Link
                              to={`/p/${row.speaker_slug}`}
                              className="text-foreground font-medium hover:underline"
                            >
                              {row.speaker_name}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </div>
                            {(() => {
                              const sameStory = rows.filter(r => r.story_id === row.story_id);
                              const roundIdx = sameStory.indexOf(row);
                              const label = sameStory.length > 1
                                ? `${row.story_title} (round ${roundIdx + 1})`
                                : row.story_title;
                              return label ? (
                                <Link
                                  to={`/story/${row.story_id}`}
                                  className="text-xs text-muted-foreground/70 hover:text-muted-foreground truncate max-w-[120px] block hover:underline"
                                >
                                  {label}
                                </Link>
                              ) : null;
                            })()}
                          </td>
                          <td className="py-2 px-2 text-center tabular-nums">{row.listener_rating ?? '–'}</td>
                          <td className="py-2 px-2 text-center tabular-nums">{row.speaker_rating ?? '–'}</td>
                          <td className="py-2 pl-2 pr-3 text-center tabular-nums font-medium">
                            {(() => {
                              const d = computeDiff(row);
                              if (d === null) return '–';
                              if (d > 0) return `+${d} over`;
                              if (d < 0) return `${d} under`;
                              return '0';
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {state === 'unlocked' && <FooterRow rows={rows} />}
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
